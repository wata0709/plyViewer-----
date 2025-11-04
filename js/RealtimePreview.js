import * as THREE from 'three';

class RealtimePreview {
    constructor() {
        this.originalModel = null;
        this.previewModel = null;
        this.outsideModel = null;
        this.boundaryModel = null; // 境界点群用モデル
        this.outsideOpacity = 0.1; // 10%に変更
        this.showOutside = true;
        this.showBoundary = true; // 境界点群表示フラグ（常時表示）
        this.boundaryThreshold = 0.05; // 境界検出の閾値（箱からの距離）
    }

    setOriginalModel(model) {
        this.originalModel = model;
    }

    updatePreview(scene, trimBox) {
        if (!this.originalModel || !trimBox) {
            this.clearPreview(scene);
            return;
        }

        const trimBoxBounds = new THREE.Box3().setFromObject(trimBox);
        
        // 既存のモデルをクリーンアップ（previewModel、outsideModel、boundaryModel）
        if (this.previewModel) {
            scene.remove(this.previewModel);
            this.previewModel.geometry.dispose();
            this.previewModel.material.dispose();
            this.previewModel = null;
        }
        
        if (this.outsideModel) {
            scene.remove(this.outsideModel);
            this.outsideModel.geometry.dispose();
            this.outsideModel.material.dispose();
            this.outsideModel = null;
        }
        
        if (this.boundaryModel) {
            scene.remove(this.boundaryModel);
            this.boundaryModel.geometry.dispose();
            this.boundaryModel.material.dispose();
            this.boundaryModel = null;
        }

        const originalGeometry = this.originalModel.geometry;
        const positions = originalGeometry.attributes.position.array;
        const colors = originalGeometry.attributes.color?.array;
        
        // モデルの現在の回転を取得
        const modelRotation = this.originalModel.rotation;

        const insidePositions = [];
        const outsidePositions = [];
        const boundaryPositions = []; // 境界点群用
        const insideColors = [];
        const outsideColors = [];
        const boundaryColors = []; // 境界点群の色（白色で固定）

        // トリミング箱の逆変換行列を計算（箱の回転を考慮）
        const trimBoxMatrix = new THREE.Matrix4();
        trimBoxMatrix.makeRotationFromEuler(trimBox.rotation);
        trimBoxMatrix.setPosition(trimBox.position);
        const trimBoxInverseMatrix = trimBoxMatrix.clone().invert();
        
        // トリミング箱のローカル座標系でのサイズ
        const trimBoxSize = new THREE.Vector3(
            trimBox.geometry.parameters.width / 2,
            trimBox.geometry.parameters.height / 2,
            trimBox.geometry.parameters.depth / 2
        );

        for (let i = 0; i < positions.length; i += 3) {
            // ローカル座標の頂点
            const localPoint = new THREE.Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            );
            
            // ワールド座標に変換（モデルの回転を適用）
            const worldPoint = localPoint.clone();
            worldPoint.applyEuler(modelRotation);

            // ワールド座標をトリミング箱のローカル座標系に変換
            const trimBoxLocalPoint = worldPoint.clone();
            trimBoxLocalPoint.applyMatrix4(trimBoxInverseMatrix);
            
            // ローカル座標系での判定
            const isInside = Math.abs(trimBoxLocalPoint.x) <= trimBoxSize.x &&
                           Math.abs(trimBoxLocalPoint.y) <= trimBoxSize.y &&
                           Math.abs(trimBoxLocalPoint.z) <= trimBoxSize.z;

            // 境界点群判定（各面からの距離を計算）
            let isBoundary = false;
            if (isInside) {
                const distanceToXMin = Math.abs(Math.abs(trimBoxLocalPoint.x) - trimBoxSize.x);
                const distanceToYMin = Math.abs(Math.abs(trimBoxLocalPoint.y) - trimBoxSize.y);
                const distanceToZMin = Math.abs(Math.abs(trimBoxLocalPoint.z) - trimBoxSize.z);
                
                // どれか一つの面に近い場合は境界点群
                const minDistance = Math.min(distanceToXMin, distanceToYMin, distanceToZMin);
                isBoundary = minDistance <= this.boundaryThreshold;
            }

            if (isBoundary && this.showBoundary) {
                // 境界点群として分類（白色で表示）
                boundaryPositions.push(positions[i], positions[i + 1], positions[i + 2]);
                boundaryColors.push(1.0, 1.0, 1.0); // 白色（RGB = 1,1,1）
            } else if (isInside) {
                insidePositions.push(positions[i], positions[i + 1], positions[i + 2]);
                if (colors) {
                    insideColors.push(colors[i], colors[i + 1], colors[i + 2]);
                }
            } else {
                outsidePositions.push(positions[i], positions[i + 1], positions[i + 2]);
                if (colors) {
                    outsideColors.push(colors[i], colors[i + 1], colors[i + 2]);
                }
            }
        }

        // 箱の内側の点群のみを表示（外側は完全に非表示）
        const previewGeometry = new THREE.BufferGeometry();
        previewGeometry.setAttribute('position', new THREE.Float32BufferAttribute(insidePositions, 3));
        if (insideColors.length > 0) {
            previewGeometry.setAttribute('color', new THREE.Float32BufferAttribute(insideColors, 3));
        }

        let material;
        if (this.originalModel.type === 'Points') {
            material = new THREE.PointsMaterial({
                size: 0.035,
                vertexColors: colors ? true : false,
                color: colors ? 0xffffff : 0x00aaff
            });
            this.previewModel = new THREE.Points(previewGeometry, material);
        } else {
            material = new THREE.PointsMaterial({
                size: 0.035,
                vertexColors: colors ? true : false,
                color: colors ? 0xffffff : 0x00aaff
            });
            this.previewModel = new THREE.Points(previewGeometry, material);
        }

        // プレビューモデルにも同じ回転を適用
        this.previewModel.rotation.copy(this.originalModel.rotation);
        scene.add(this.previewModel);
        
        // 境界点群モデルを作成（白色で表示）
        if (boundaryPositions.length > 0 && this.showBoundary) {
            const boundaryGeometry = new THREE.BufferGeometry();
            boundaryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(boundaryPositions, 3));
            boundaryGeometry.setAttribute('color', new THREE.Float32BufferAttribute(boundaryColors, 3));
            
            const boundaryMaterial = new THREE.PointsMaterial({
                size: 0.04, // 境界点群は少し大きく表示
                vertexColors: true, // 白色を適用
                transparent: true,
                opacity: 0.9,
                depthTest: false,  // 深度テストを無効にして常に最前面に表示
                depthWrite: false  // 深度バッファに書き込まない
            });
            
            this.boundaryModel = new THREE.Points(boundaryGeometry, boundaryMaterial);
            this.boundaryModel.rotation.copy(this.originalModel.rotation);
            this.boundaryModel.renderOrder = 999; // 高いレンダリング順序で最前面に表示（境界線より少し後ろ）
            scene.add(this.boundaryModel);
        }
        
        // 箱の外側のモデルも作成（デフォルトでは非表示）
        if (outsidePositions.length > 0) {
            const outsideGeometry = new THREE.BufferGeometry();
            outsideGeometry.setAttribute('position', new THREE.Float32BufferAttribute(outsidePositions, 3));
            if (outsideColors.length > 0) {
                outsideGeometry.setAttribute('color', new THREE.Float32BufferAttribute(outsideColors, 3));
            }
            
            const outsideMaterial = new THREE.PointsMaterial({
                size: 0.035,
                vertexColors: colors ? true : false,
                color: colors ? 0xffffff : 0x00aaff,
                opacity: this.outsideOpacity,
                transparent: true
            });
            
            this.outsideModel = new THREE.Points(outsideGeometry, outsideMaterial);
            this.outsideModel.rotation.copy(this.originalModel.rotation);
            this.outsideModel.visible = this.showOutside;
            scene.add(this.outsideModel);
        }
        
        this.isPreviewMode = true;
    }

    clearPreview(scene) {
        if (this.previewModel) {
            scene.remove(this.previewModel);
            this.previewModel.geometry.dispose();
            this.previewModel.material.dispose();
            this.previewModel = null;
        }
        if (this.outsideModel) {
            scene.remove(this.outsideModel);
            this.outsideModel.geometry.dispose();
            this.outsideModel.material.dispose();
            this.outsideModel = null;
        }
        if (this.boundaryModel) {
            scene.remove(this.boundaryModel);
            this.boundaryModel.geometry.dispose();
            this.boundaryModel.material.dispose();
            this.boundaryModel = null;
        }
        this.isPreviewMode = false;
    }

    toggleOutsideVisibility() {
        this.showOutside = !this.showOutside;
        if (this.outsideModel) {
            this.outsideModel.visible = this.showOutside;
        }
        return this.showOutside;
    }

    setOutsideOpacity(opacity) {
        this.outsideOpacity = Math.max(0, Math.min(1, opacity));
        if (this.outsideModel && this.outsideModel.material) {
            this.outsideModel.material.opacity = this.outsideOpacity;
        }
    }

    toggleBoundaryVisibility() {
        this.showBoundary = !this.showBoundary;
        if (this.boundaryModel) {
            this.boundaryModel.visible = this.showBoundary;
        }
        return this.showBoundary;
    }

    setBoundaryThreshold(threshold) {
        this.boundaryThreshold = Math.max(0.001, Math.min(0.2, threshold));
    }

    getBoundaryThreshold() {
        return this.boundaryThreshold;
    }

    getOutsideOpacity() {
        return this.outsideOpacity;
    }

    hideOriginalModel() {
        if (this.originalModel) {
            this.originalModel.visible = false;
        }
    }

    showOriginalModel() {
        if (this.originalModel) {
            this.originalModel.visible = true;
        }
    }

    isInPreviewMode() {
        return this.isPreviewMode;
    }
}

export { RealtimePreview };
