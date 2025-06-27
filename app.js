import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

class TrimBoxManipulator {
    constructor(scene, camera, renderer, controls, getCurrentModel) {
        this.scene = scene;
        this.camera = camera;
        this.renderer = renderer;
        this.controls = controls;
        this.getCurrentModel = getCurrentModel;
        this.trimBox = null;
        this.boxHelper = null;
        this.handles = [];
        this.faceHandles = []; // 面のハンドル（矢印）
        this.edgeHandles = []; // エッジのハンドル
        this.cornerHandles = []; // 頂点のハンドル
        this.rotationAxes = []; // 回転軸表示用
        this.initialEdgeRotations = []; // エッジハンドルの初期回転を保存
        this.showAxes = false; // 軸表示フラグ
        this.isDragging = false;
        this.activeHandle = null;
        this.selectedFace = null; // 選択された面
        this.initialMousePos = new THREE.Vector2();
        this.initialBoxSize = new THREE.Vector3();
        this.initialBoxPos = new THREE.Vector3();
        
        // 固定サイズ用の変数
        this.fixedBoxSize = 0;
        this.targetPosition = new THREE.Vector3();
        this.currentScale = 1.0;
        
        // トリミング箱の色・透明度設定
        this.boxColor = 0xffffff; // #FFFに変更
        this.boxOpacity = 0.1; // 10%に変更
        
        // エッジハンドル向き調整用
        this.edgeRotationOffset = 0; // 度単位での回転オフセット（全体）
        this.individualEdgeYRotations = [-90, 0, 0, -90]; // 各ハンドルの個別Y軸回転（度単位）
        this.individualEdgeXRotations = [90, -90, 90, -90]; // 各ハンドルの個別X軸回転（度単位）
        
        // 矢印サイズの個別パラメータ
        this.arrowOffset = 0.55;      // 始まり位置（箱からの距離）
        this.arrowTipRadius = 1.4;    // 先端の大きさ（円錐の半径）
        this.arrowTipHeight = 3.0;    // 先端の高さ（円錐の高さ）
        this.arrowShaftRadius = 1.0;  // 線の太さ（円柱の半径）
        this.arrowShaftHeight = 3.0;  // 線の長さ（円柱の高さ）
        
        this.raycaster = new THREE.Raycaster();
        // Lineのレイキャスト判定を厳密にする
        this.raycaster.params.Line.threshold = 0.05; // デフォルト: 1
        this.mouse = new THREE.Vector2();
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', (e) => this.onMouseUp(e));
        
        // Escキーでトリミング操作をキャンセル
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isDragging) {
                    this.cancelTrimming();
                } else if (this.selectedFace) {
                    this.deselectFace();
                }
            }
        });
    }

    create(boundingBox) {
        this.clear();
        
        const modelCenter = boundingBox.getCenter(new THREE.Vector3());
        
        // 初期表示時のみ画面サイズに基づいて箱サイズを計算
        const cameraDistance = this.camera.position.distanceTo(modelCenter);
        const fov = this.camera.fov * (Math.PI / 180);
        
        // 画面の30%程度のサイズになるように計算
        const viewportHeight = 2 * Math.tan(fov / 2) * cameraDistance;
        const boxSize = viewportHeight * 0.3;
        
        const geometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        const material = new THREE.MeshBasicMaterial({
            color: this.boxColor,
            transparent: true,
            opacity: this.boxOpacity,
            side: THREE.DoubleSide
        });
        
        this.trimBox = new THREE.Mesh(geometry, material);
        this.trimBox.position.copy(modelCenter);
        this.scene.add(this.trimBox);
        
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: this.boxColor, 
            linewidth: 2 
        });
        this.boxHelper = new THREE.LineSegments(edges, lineMaterial);
        this.boxHelper.position.copy(modelCenter);
        this.scene.add(this.boxHelper);
        
        // 初期の3D空間でのサイズと位置を保存
        this.fixedBoxSize = boxSize;
        this.targetPosition = modelCenter.clone();
        this.currentScale = 1.0;
        
        this.createHandles();
        console.log('新しいマニピュレーターを作成:', { fixedBoxSize: this.fixedBoxSize, position: this.targetPosition });
    }

    createHandles() {
        this.handles = [];
        this.faceHandles = [];
        this.edgeHandles = [];
        this.cornerHandles = [];
        this.initialEdgeRotations = []; // 初期回転をリセット
        
        const box = new THREE.Box3().setFromObject(this.trimBox);
        const min = box.min;
        const max = box.max;
        const center = box.getCenter(new THREE.Vector3());
        
        // 立方体ハンドル（白色）
        const cornerHandleGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const cornerHandleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        // 矢印ハンドル（白色、初期は非表示）
        const faceHandleGeometry = this.createArrowGeometry();
        const faceHandleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        
        // エッジハンドル（円の4分の1、Y軸回転用の4辺のみ）
        const edgeHandleGeometry = this.createQuarterCircleTubeGeometry();
        const edgeHandleMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff  // 白色
        });
        
        // 頂点ハンドル（8つの頂点）
        const cornerPositions = [
            { pos: new THREE.Vector3(max.x, max.y, max.z), type: 'corner', corner: 'max-max-max' },
            { pos: new THREE.Vector3(max.x, max.y, min.z), type: 'corner', corner: 'max-max-min' },
            { pos: new THREE.Vector3(max.x, min.y, max.z), type: 'corner', corner: 'max-min-max' },
            { pos: new THREE.Vector3(max.x, min.y, min.z), type: 'corner', corner: 'max-min-min' },
            { pos: new THREE.Vector3(min.x, max.y, max.z), type: 'corner', corner: 'min-max-max' },
            { pos: new THREE.Vector3(min.x, max.y, min.z), type: 'corner', corner: 'min-max-min' },
            { pos: new THREE.Vector3(min.x, min.y, max.z), type: 'corner', corner: 'min-min-max' },
            { pos: new THREE.Vector3(min.x, min.y, min.z), type: 'corner', corner: 'min-min-min' }
        ];
        
        // 面ハンドル（6つの面、初期は非表示）- 箱の外側に少し出して配置
        const offset = this.arrowOffset; // 箱から離す距離（動的設定）
        const facePositions = [
            { pos: new THREE.Vector3(max.x + offset, center.y, center.z), type: 'face', axis: 'x', direction: 1 },
            { pos: new THREE.Vector3(min.x - offset, center.y, center.z), type: 'face', axis: 'x', direction: -1 },
            { pos: new THREE.Vector3(center.x, max.y + offset, center.z), type: 'face', axis: 'y', direction: 1 },
            { pos: new THREE.Vector3(center.x, min.y - offset, center.z), type: 'face', axis: 'y', direction: -1 },
            { pos: new THREE.Vector3(center.x, center.y, max.z + offset), type: 'face', axis: 'z', direction: 1 },
            { pos: new THREE.Vector3(center.x, center.y, min.z - offset), type: 'face', axis: 'z', direction: -1 }
        ];
        
        // エッジハンドル（Y軸回転用の水平な4辺のみ）- 箱の高さ中央に配置
        const edgePositions = [
            { pos: new THREE.Vector3(max.x, center.y, max.z), type: 'edge', edgeType: 'horizontal' },
            { pos: new THREE.Vector3(max.x, center.y, min.z), type: 'edge', edgeType: 'horizontal' },
            { pos: new THREE.Vector3(min.x, center.y, max.z), type: 'edge', edgeType: 'horizontal' },
            { pos: new THREE.Vector3(min.x, center.y, min.z), type: 'edge', edgeType: 'horizontal' }
        ];
        
        // 頂点ハンドルを作成
        cornerPositions.forEach(handleData => {
            const handle = new THREE.Mesh(cornerHandleGeometry, cornerHandleMaterial.clone());
            handle.position.copy(handleData.pos);
            handle.userData = handleData;
            this.scene.add(handle);
            this.handles.push(handle);
            this.cornerHandles.push(handle);
            console.log('頂点ハンドル作成:', { type: handleData.type, corner: handleData.corner });
        });
        
        // 面ハンドルを作成（初期は非表示）
        facePositions.forEach(handleData => {
            // 新しい矢印Groupを作成（clone()ではなく新規作成）
            const handle = this.createArrowGeometry();
            handle.position.copy(handleData.pos);
            handle.userData = handleData;
            handle.visible = false; // 初期は非表示
            
            // 矢印を面の法線方向に向ける
            this.orientArrowHandle(handle, handleData);
            
            this.scene.add(handle);
            this.handles.push(handle); // 面ハンドルもhandlesに追加
            this.faceHandles.push(handle);
            console.log('面ハンドル作成:', { 
                type: handleData.type, 
                axis: handleData.axis, 
                direction: handleData.direction,
                groupType: handle.type,
                userDataSet: !!handle.userData,
                childrenCount: handle.children.length
            });
        });
        
        // エッジハンドルを作成（太いチューブとして）
        edgePositions.forEach((handleData, index) => {
            const handle = new THREE.Mesh(edgeHandleGeometry, edgeHandleMaterial.clone());
            handle.position.copy(handleData.pos);
            handle.userData = { ...handleData, handleIndex: index };
            
            // ジオメトリの境界ボックスを計算
            if (handle.geometry) {
                handle.geometry.computeBoundingBox();
            }
            
            // 円の4分の1を適切に配置
            this.orientQuarterCircleHandle(handle, handle.userData);
            
            // 箱に対する相対回転を保存（初期状態では箱の回転は0なので、そのまま相対角度になる）
            this.initialEdgeRotations[index] = {
                x: handle.rotation.x,
                y: handle.rotation.y,
                z: handle.rotation.z
            };
            
            this.scene.add(handle);
            this.handles.push(handle);
            this.edgeHandles.push(handle);
            console.log('エッジハンドル作成:', { 
                type: handleData.type, 
                edgeType: handleData.edgeType, 
                handleIndex: index,
                initialRotation: this.initialEdgeRotations[index]
            });
        });
        
        // 回転軸を作成（初期は非表示）
        this.createRotationAxes();
    }

    createArrowGeometry() {
        // 矢印形状：線部分（円柱）と先端（円錐）を組み合わせ
        const arrowGroup = new THREE.Group();
        
        // 基本サイズ
        const baseShaftRadius = 0.03;
        const baseShaftHeight = 0.15;
        const baseTipRadius = 0.06;
        const baseTipHeight = 0.12;
        
        // 個別パラメータ適用
        const shaftRadius = baseShaftRadius * this.arrowShaftRadius;
        const shaftHeight = baseShaftHeight * this.arrowShaftHeight;
        const tipRadius = baseTipRadius * this.arrowTipRadius;
        const tipHeight = baseTipHeight * this.arrowTipHeight;
        
        // 線部分（円柱）
        const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftHeight, 8);
        const shaftMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
        
        // 先端部分（円錐）
        const tipGeometry = new THREE.ConeGeometry(tipRadius, tipHeight, 8);
        const tipMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const tip = new THREE.Mesh(tipGeometry, tipMaterial);
        
        // 位置調整：円柱と円錐が適切に接続するように配置
        const totalHeight = shaftHeight + tipHeight;
        shaft.position.y = -tipHeight * 0.5; // 円柱を下に配置
        tip.position.y = shaftHeight * 0.5;   // 円錐を上に配置
        
        arrowGroup.add(shaft);
        arrowGroup.add(tip);
        
        return arrowGroup;
    }

    createQuarterCircleTubeGeometry() {
        // 円の4分の1の太いチューブを作成
        const curve = new THREE.EllipseCurve(
            0, 0,            // 中心
            0.3, 0.3,      // 半径（0.08 → 0.15に拡大）
            0, Math.PI / 2,  // 角度範囲（0度から90度）
            false,           // 時計回り
            0                // 回転
        );
        
        // 2D曲線を3D曲線に変換（Z-X平面に配置して、元の線と同じ向きにする）
        const points = curve.getPoints(16);
        const curve3D = new THREE.CatmullRomCurve3(
            points.map(point => new THREE.Vector3(point.x, 0, point.y))
        );
        
        // チューブジオメトリを作成（太さと高さ方向の厚みを持つ）
        const tubeGeometry = new THREE.TubeGeometry(
            curve3D,        // 曲線
            16,             // 曲線に沿ったセグメント数
            0.03,          // チューブの半径（太さを少し太く）
            8,              // 円周方向のセグメント数
            false           // 閉じるかどうか
        );
        
        // 高さ方向（Y軸）に厚みを持たせる
        tubeGeometry.scale(1, 1.5, 1); // Y軸方向に4倍に拡大して厚みを持たせる
        
        // ジオメトリを適切な向きに回転（元の線の向きに合わせる）
        // X軸周りに-90度回転してXZ平面に配置
        tubeGeometry.rotateX(-Math.PI / 2);
        
        return tubeGeometry;
    }

    orientArrowHandle(handle, handleData) {
        // 矢印を面の法線方向に向ける
        const { axis, direction } = handleData;
        
        switch (axis) {
            case 'x':
                if (direction > 0) {
                    handle.rotation.z = -Math.PI / 2;
                } else {
                    handle.rotation.z = Math.PI / 2;
                }
                break;
            case 'y':
                if (direction > 0) {
                    // デフォルトの向き（上向き）
                } else {
                    handle.rotation.z = Math.PI;
                }
                break;
            case 'z':
                if (direction > 0) {
                    handle.rotation.x = Math.PI / 2;
                } else {
                    handle.rotation.x = -Math.PI / 2;
                }
                break;
        }
    }

    orientQuarterCircleHandle(handle, handleData) {
        // 各辺の位置に応じて回転 - 円側が外向きになるように調整
        const pos = handleData.pos;
        const center = this.trimBox.position;
        
        let baseAngleY = 0;
        if (pos.x > center.x && pos.z > center.z) {
            // 右奥の辺 - 円が右奥向き
            baseAngleY = Math.PI / 2;
        } else if (pos.x > center.x && pos.z < center.z) {
            // 右手前の辺 - 円が右手前向き
            baseAngleY = 0;
        } else if (pos.x < center.x && pos.z > center.z) {
            // 左奥の辺 - 円が左奥向き
            baseAngleY = Math.PI;
        } else {
            // 左手前の辺 - 円が左手前向き
            baseAngleY = -Math.PI / 2;
        }
        
        // ユーザー調整オフセットを適用（個別設定優先）
        const handleIndex = handleData.handleIndex;
        const globalYOffsetRadians = (this.edgeRotationOffset || 0) * (Math.PI / 180);
        const individualYOffsetRadians = (this.individualEdgeYRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualXOffsetRadians = (this.individualEdgeXRotations[handleIndex] || 0) * (Math.PI / 180);
        
        handle.rotation.x = individualXOffsetRadians;
        handle.rotation.y = baseAngleY + globalYOffsetRadians + individualYOffsetRadians;
        handle.rotation.z = 0;
    }

    orientQuarterCircleHandleWithRotation(handle, handleData, boxRotation) {
        // ハンドルの現在の位置から箱の中心への相対位置を計算
        // （位置は既に箱の回転を考慮して更新されているため、現在位置を使用）
        const currentPos = handle.position;
        const center = this.trimBox.position;
        const relativeX = currentPos.x > center.x ? 1 : -1;
        const relativeZ = currentPos.z > center.z ? 1 : -1;
        
        // ローカル座標系での基本角度を計算（箱の回転は位置で既に考慮済み）
        let baseAngleY = 0;
        if (relativeX > 0 && relativeZ > 0) {
            // 右奥の辺 - 円が右奥向き
            baseAngleY = Math.PI / 2;
        } else if (relativeX > 0 && relativeZ < 0) {
            // 右手前の辺 - 円が右手前向き
            baseAngleY = 0;
        } else if (relativeX < 0 && relativeZ > 0) {
            // 左奥の辺 - 円が左奥向き
            baseAngleY = Math.PI;
        } else {
            // 左手前の辺 - 円が左手前向き
            baseAngleY = -Math.PI / 2;
        }
        
        // ユーザー調整オフセットのみを適用（箱の回転は除去）
        const handleIndex = handleData.handleIndex;
        const globalYOffsetRadians = (this.edgeRotationOffset || 0) * (Math.PI / 180);
        const individualYOffsetRadians = (this.individualEdgeYRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualXOffsetRadians = (this.individualEdgeXRotations[handleIndex] || 0) * (Math.PI / 180);
        
        handle.rotation.x = individualXOffsetRadians;
        handle.rotation.y = baseAngleY + globalYOffsetRadians + individualYOffsetRadians;
        handle.rotation.z = 0;
    }

    onMouseDown(event) {
        event.preventDefault();
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        console.log('マウスダウン:', { x: this.mouse.x, y: this.mouse.y });
        
        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // まずハンドルをチェック（面ハンドルが表示されている場合は優先）
        // Raycasterは自動的にvisible=falseのオブジェクトを無視する
        // 表示中のハンドルを詳細にログ出力
        const visibleHandles = this.handles.filter(h => h.visible);
        console.log('Raycaster準備:', {
            mousePos: { x: this.mouse.x, y: this.mouse.y },
            totalHandles: this.handles.length,
            visibleHandles: visibleHandles.length,
            visibleHandleTypes: visibleHandles.map(h => h.userData?.type).filter(Boolean),
            faceHandles: this.faceHandles.length,
            cornerHandles: this.cornerHandles.length,
            edgeHandles: this.edgeHandles.length
        });
        
        // 回転軸オブジェクトを除外したハンドルのみを対象にする
        const targetHandles = this.handles.filter(handle => 
            !handle.userData?.type || handle.userData.type !== 'rotationAxis'
        );
        const intersects = this.raycaster.intersectObjects(targetHandles, true);
        console.log('ハンドル検出結果:', { 
            intersectsCount: intersects.length,
            allIntersects: intersects.map(intersect => ({
                objectType: intersect.object.type,
                hasUserData: !!intersect.object.userData,
                parentType: intersect.object.parent ? intersect.object.parent.type : 'none',
                parentHasUserData: intersect.object.parent ? !!intersect.object.parent.userData : false,
                parentUserDataType: intersect.object.parent ? intersect.object.parent.userData?.type : null,
                grandParentType: intersect.object.parent?.parent ? intersect.object.parent.parent.type : 'none'
            }))
        });
        
        if (intersects.length > 0) {
            console.log('ハンドルヒット検出開始 - ドラッグ準備');
            this.isDragging = true;
            
            // Groupの子要素がヒットした場合は親のGroupを取得
            let targetObject = intersects[0].object;
            console.log('初期targetObject:', { type: targetObject.type, hasUserData: !!targetObject.userData });
            
            // userDataを持つ親を探す（最大3階層まで遡る）
            let currentObject = targetObject;
            for (let i = 0; i < 3; i++) {
                if (currentObject.userData && currentObject.userData.type) {
                    console.log('userDataを持つオブジェクト発見:', { type: currentObject.type, userData: currentObject.userData });
                    targetObject = currentObject;
                    break;
                }
                if (currentObject.parent && currentObject.parent !== this.scene) {
                    currentObject = currentObject.parent;
                    console.log('親を辿る:', { type: currentObject.type, hasUserData: !!currentObject.userData });
                } else {
                    console.log('これ以上親がない、またはSceneに到達');
                    break;
                }
            }
            
            this.activeHandle = targetObject;
            this.initialMousePos.copy(this.mouse);
            
            // 操作タイプに応じて初期値を保存
            const userData = this.activeHandle.userData;
            console.log('ハンドル操作開始:', userData);
            this.initialBoxBounds = new THREE.Box3().setFromObject(this.trimBox);
            this.initialBoxPosition = this.trimBox.position.clone(); // 箱移動用の初期位置を保存
            
            if (userData.type === 'corner') {
                this.initialCornerPositions = this.getCornerPositions();
            } else if (userData.type === 'edge') {
                this.initialBoxRotation = this.trimBox.rotation.y;
            }
            
            // 選択時の色変更
            if (userData.type === 'face') {
                // Groupの子要素の色を黄色に変更
                console.log('面ハンドル色変更:', { childrenCount: this.activeHandle.children.length });
                this.activeHandle.children.forEach(child => {
                    if (child.material) {
                        child.material.color.setHex(0xffff00);
                        console.log('子要素の色変更:', child.type);
                    }
                });
            } else {
                this.activeHandle.material.color.setHex(0xffff00);
                console.log('通常ハンドル色変更:', userData.type);
            }
            this.renderer.domElement.style.cursor = 'grabbing';
            
            this.disableOrbitControls();
            this.showTrimmingInfo();
        } else {
            // ハンドルが検出されなかった場合、箱の面をチェック
            if (this.trimBox) {
                const boxIntersects = this.raycaster.intersectObject(this.trimBox);
                if (boxIntersects.length > 0) {
                    console.log('箱の面をクリック - 箱移動モード開始 + 面ハンドル表示');
                    
                    const intersection = boxIntersects[0];
                    
                    // 面ハンドルを表示（触った面の矢印を表示）
                    this.selectFaceFromIntersection(intersection);
                    
                    // 箱移動モードを開始
                    this.isDragging = true;
                    this.activeHandle = { userData: { type: 'boxMove' } };
                    this.initialMousePos.copy(this.mouse);
                    this.initialBoxPosition = this.trimBox.position.clone();
                    this.renderer.domElement.style.cursor = 'grabbing';
                    
                    // 箱移動時の色変更（青色）
                    this.setBoxMoveColors(true);
                    
                    this.disableOrbitControls();
                    this.showTrimmingInfo();
                    return;
                }
            }
            
            // 空の場所をクリック - 面選択を解除
            console.log('空の場所をクリック - 面選択解除');
            this.deselectFace();
        }
    }

    selectFaceFromIntersection(intersection) {
        // 交差点の法線から面を特定
        const normal = intersection.face.normal.clone();
        normal.transformDirection(this.trimBox.matrixWorld);
        
        // 最も近い軸方向を見つける
        const absNormal = new THREE.Vector3(Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z));
        let axis, direction;
        
        if (absNormal.x > absNormal.y && absNormal.x > absNormal.z) {
            axis = 'x';
            direction = normal.x > 0 ? 1 : -1;
        } else if (absNormal.y > absNormal.z) {
            axis = 'y';
            direction = normal.y > 0 ? 1 : -1;
        } else {
            axis = 'z';
            direction = normal.z > 0 ? 1 : -1;
        }
        
        // 対応する面ハンドルを選択（面拡縮用に表示）
        const faceHandle = this.faceHandles.find(handle => 
            handle.userData.axis === axis && handle.userData.direction === direction
        );
        
        if (faceHandle) {
            this.selectFace(faceHandle);
        }
    }

    selectFace(faceHandle) {
        // 前の選択を解除
        this.deselectFace();
        
        // 新しい面を選択
        this.selectedFace = faceHandle;
        faceHandle.visible = true;
        
        // Groupの子要素（線部分と先端）の色を白色に設定
        console.log('面選択時のハンドル情報:', {
            type: faceHandle.type,
            childrenCount: faceHandle.children.length,
            hasUserData: !!faceHandle.userData
        });
        faceHandle.children.forEach(child => {
            if (child.material) {
                child.material.color.setHex(0xffffff);
                console.log('子要素色設定:', child.type);
            }
        });
        
        // 選択された面ハンドルをドラッグ可能なハンドルとして登録
        // ※この時点で面ハンドルは既にthis.handlesに含まれているはず
        
        console.log('面を選択:', faceHandle.userData);
        console.log('面ハンドルがhandlesに含まれているか:', this.handles.includes(faceHandle));
        console.log('現在のhandles数:', this.handles.length);
    }

    deselectFace() {
        if (this.selectedFace) {
            this.selectedFace.visible = false;
            this.selectedFace = null;
            console.log('面選択を解除');
        }
    }

    getCornerPositions() {
        // 現在の8つの頂点位置を取得
        const positions = {};
        this.cornerHandles.forEach(handle => {
            positions[handle.userData.corner] = handle.position.clone();
        });
        return positions;
    }

    onMouseMove(event) {
        if (!this.isDragging || !this.activeHandle) {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            this.raycaster.setFromCamera(this.mouse, this.camera);
            // 回転軸オブジェクトを除外したハンドルのみを対象にする
            const targetHandles = this.handles.filter(handle => 
                !handle.userData?.type || handle.userData.type !== 'rotationAxis'
            );
            const intersects = this.raycaster.intersectObjects(targetHandles, true);
            
            if (intersects.length > 0) {
                this.renderer.domElement.style.cursor = 'grab';
            } else {
                this.renderer.domElement.style.cursor = 'default';
            }
            return;
        }
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        const deltaX = (this.mouse.x - this.initialMousePos.x) * 5;
        const deltaY = (this.mouse.y - this.initialMousePos.y) * 5;
        
        this.updateBoxFromHandle(deltaX, deltaY);
    }

    onMouseUp(event) {
        if (this.activeHandle) {
            // 箱移動モードの場合は色をリセット
            if (this.activeHandle.userData.type === 'boxMove') {
                this.setBoxMoveColors(false);
            } else {
                this.resetHandleColor(this.activeHandle);
            }
            this.activeHandle = null;
        }
        this.isDragging = false;
        this.renderer.domElement.style.cursor = 'default';
        
        // ハンドル操作終了時にカメラコントロールを再有効化
        this.enableOrbitControls();
        this.hideTrimmingInfo();
    }


    setBoxMoveColors(isMoving) {
        if (!this.trimBox || !this.boxHelper) return;
        
        const color = isMoving ? 0x0066ff : this.boxColor; // 青色 または 元の色
        const opacity = isMoving ? 0.3 : this.boxOpacity; // 移動時は少し濃く
        
        // 箱の面の色を変更
        if (this.trimBox.material) {
            this.trimBox.material.color.setHex(color);
            this.trimBox.material.opacity = opacity;
        }
        
        // 箱の辺（エッジライン）の色を変更
        if (this.boxHelper.material) {
            this.boxHelper.material.color.setHex(color);
        }
        
        console.log('箱移動色変更:', { isMoving, color: color.toString(16) });
    }

    resetHandleColor(handle) {
        const userData = handle.userData;
        switch (userData.type) {
            case 'face':
                // Groupの子要素の色を白色に戻す
                handle.children.forEach(child => {
                    if (child.material) {
                        child.material.color.setHex(0xffffff);
                    }
                });
                break;
            case 'edge':
                handle.material.color.setHex(0xffffff); // 白色
                break;
            case 'corner':
                handle.material.color.setHex(0xffffff); // 白色に変更
                break;
        }
    }

    updateBoxFromHandle(deltaX, deltaY) {
        if (!this.activeHandle || !this.trimBox) return;
        
        const userData = this.activeHandle.userData;
        console.log('updateBoxFromHandle実行:', { type: userData?.type, deltaX, deltaY });
        
        // userDataが存在し、かつ有効なtypeが設定されている場合のみ処理
        if (!userData || !userData.type) {
            console.warn('userDataまたはtypeが設定されていないオブジェクト:', this.activeHandle);
            return;
        }
        
        switch (userData.type) {
            case 'face':
                console.log('面操作実行:', userData);
                this.updateFaceSize(userData, deltaX, deltaY);
                break;
            case 'edge':
                console.log('エッジ操作実行 - 回転処理開始:', userData);
                console.log('エッジハンドル詳細:', { 
                    handleIndex: userData.handleIndex, 
                    edgeType: userData.edgeType,
                    deltaX: deltaX 
                });
                this.updateBoxRotation(deltaX);
                break;
            case 'corner':
                console.log('頂点操作実行:', userData);
                this.updateCornerPosition(userData, deltaX, deltaY);
                break;
            case 'boxMove':
                console.log('箱移動実行:', { deltaX, deltaY });
                this.updateBoxPosition(deltaX, deltaY);
                break;
            default:
                console.warn('未知のハンドルタイプ:', userData);
                // 未知のタイプの場合は何も処理しない
                return;
        }
    }

    updateFaceSize(userData, deltaX, deltaY) {
        // 面操作：対面を固定基点とした面移動
        
        const initialMin = this.initialBoxBounds.min.clone();
        const initialMax = this.initialBoxBounds.max.clone();
        const initialCenter = this.initialBoxBounds.getCenter(new THREE.Vector3());
        
        // 選択した面の中心点を計算
        const faceCenter = new THREE.Vector3();
        switch (userData.axis) {
            case 'x':
                faceCenter.set(
                    userData.direction > 0 ? initialMax.x : initialMin.x,
                    initialCenter.y,
                    initialCenter.z
                );
                break;
            case 'y':
                faceCenter.set(
                    initialCenter.x,
                    userData.direction > 0 ? initialMax.y : initialMin.y,
                    initialCenter.z
                );
                break;
            case 'z':
                faceCenter.set(
                    initialCenter.x,
                    initialCenter.y,
                    userData.direction > 0 ? initialMax.z : initialMin.z
                );
                break;
        }
        
        // カメラのビュー平面でのマウス移動を3D空間の移動に変換
        const camera = this.camera;
        const distance = camera.position.distanceTo(faceCenter);
        
        // カメラの右方向と上方向ベクトル
        const cameraRight = new THREE.Vector3();
        camera.getWorldDirection(cameraRight);
        cameraRight.cross(camera.up).normalize();
        const cameraUp = camera.up.clone();
        
        // スクリーン座標からワールド座標への変換倍率
        const fov = camera.fov * (Math.PI / 180);
        const viewportHeight = 2 * Math.tan(fov / 2) * distance;
        const viewportWidth = viewportHeight * camera.aspect;
        
        // マウス移動量をワールド座標での移動量に変換（感度調整）
        const sensitivity = 0.12; // 面操作は少し感度を下げる
        const worldDeltaX = (deltaX * sensitivity) * viewportWidth;
        const worldDeltaY = (deltaY * sensitivity) * viewportHeight;
        
        // 3D空間での移動ベクトルを計算
        const worldMovement = new THREE.Vector3();
        worldMovement.addScaledVector(cameraRight, worldDeltaX);
        worldMovement.addScaledVector(cameraUp, worldDeltaY);
        
        // 新しい面の位置を計算
        const newFaceCenter = faceCenter.clone().add(worldMovement);
        
        // 対面を固定基点として新しいmin/maxを計算
        const newMin = initialMin.clone();
        const newMax = initialMax.clone();
        const minSize = 0.1; // 最小サイズ
        
        switch (userData.axis) {
            case 'x':
                if (userData.direction > 0) {
                    // 右面を移動：左面は固定
                    newMax.x = Math.max(initialMin.x + minSize, newFaceCenter.x);
                } else {
                    // 左面を移動：右面は固定
                    newMin.x = Math.min(initialMax.x - minSize, newFaceCenter.x);
                }
                break;
            case 'y':
                if (userData.direction > 0) {
                    // 上面を移動：下面は固定
                    newMax.y = Math.max(initialMin.y + minSize, newFaceCenter.y);
                } else {
                    // 下面を移動：上面は固定
                    newMin.y = Math.min(initialMax.y - minSize, newFaceCenter.y);
                }
                break;
            case 'z':
                if (userData.direction > 0) {
                    // 奥面を移動：手前面は固定
                    newMax.z = Math.max(initialMin.z + minSize, newFaceCenter.z);
                } else {
                    // 手前面を移動：奥面は固定
                    newMin.z = Math.min(initialMax.z - minSize, newFaceCenter.z);
                }
                break;
        }
        
        // 新しいサイズと中心を計算
        const newSize = new THREE.Vector3(
            newMax.x - newMin.x,
            newMax.y - newMin.y,
            newMax.z - newMin.z
        );
        const newCenter = new THREE.Vector3(
            (newMin.x + newMax.x) / 2,
            (newMin.y + newMax.y) / 2,
            (newMin.z + newMax.z) / 2
        );
        
        // 箱のジオメトリを更新
        this.updateBoxSizeGeometry(newSize, newCenter);
        
        console.log('面変形:', {
            axis: userData.axis,
            direction: userData.direction,
            deltaX: deltaX,
            deltaY: deltaY,
            worldMovement: worldMovement,
            newFaceCenter: newFaceCenter,
            newCenter: newCenter,
            newSize: newSize
        });
    }

    updateBoxRotation(deltaX) {
        // 辺操作：Y軸回転
        const newRotation = this.initialBoxRotation + deltaX * 2;
        this.trimBox.rotation.y = newRotation;
        this.boxHelper.rotation.y = newRotation;
        this.updateHandlePositions();
    }

    updateCornerPosition(userData, deltaX, deltaY) {
        // 頂点操作：対角頂点を基点としたバウンディングボックス変形
        
        const initialMin = this.initialBoxBounds.min.clone();
        const initialMax = this.initialBoxBounds.max.clone();
        
        // 選択された頂点の情報を解析
        const cornerParts = userData.corner.split('-');
        const xType = cornerParts[0]; // 'max' or 'min'
        const yType = cornerParts[1]; // 'max' or 'min'
        const zType = cornerParts[2]; // 'max' or 'min'
        
        // 対角頂点（固定点）の座標を取得
        const fixedCorner = new THREE.Vector3(
            xType === 'max' ? initialMin.x : initialMax.x,
            yType === 'max' ? initialMin.y : initialMax.y,
            zType === 'max' ? initialMin.z : initialMax.z
        );
        
        // 現在選択されている頂点の初期位置
        const initialSelectedCorner = new THREE.Vector3(
            xType === 'max' ? initialMax.x : initialMin.x,
            yType === 'max' ? initialMax.y : initialMin.y,
            zType === 'max' ? initialMax.z : initialMin.z
        );
        
        // カメラのビュー平面でのマウス移動を3D空間の移動に変換
        const camera = this.camera;
        const distance = camera.position.distanceTo(initialSelectedCorner);
        
        // カメラの右方向と上方向ベクトル
        const cameraRight = new THREE.Vector3();
        camera.getWorldDirection(cameraRight);
        cameraRight.cross(camera.up).normalize();
        const cameraUp = camera.up.clone();
        
        // スクリーン座標からワールド座標への変換倍率
        const fov = camera.fov * (Math.PI / 180);
        const viewportHeight = 2 * Math.tan(fov / 2) * distance;
        const viewportWidth = viewportHeight * camera.aspect;
        
        // マウス移動量をワールド座標での移動量に変換（感度調整）
        const sensitivity = 0.15; // 感度調整係数（小さいほど動きが小さい）
        const worldDeltaX = (deltaX * sensitivity) * viewportWidth;
        const worldDeltaY = (deltaY * sensitivity) * viewportHeight;
        
        // 3D空間での移動ベクトルを計算
        const worldMovement = new THREE.Vector3();
        worldMovement.addScaledVector(cameraRight, worldDeltaX);
        worldMovement.addScaledVector(cameraUp, worldDeltaY);
        
        // 新しい選択頂点の位置を計算
        const newSelectedCorner = initialSelectedCorner.clone().add(worldMovement);
        
        // バウンディングボックスの新しいmin/maxを計算
        const newMin = new THREE.Vector3(
            Math.min(fixedCorner.x, newSelectedCorner.x),
            Math.min(fixedCorner.y, newSelectedCorner.y),
            Math.min(fixedCorner.z, newSelectedCorner.z)
        );
        
        const newMax = new THREE.Vector3(
            Math.max(fixedCorner.x, newSelectedCorner.x),
            Math.max(fixedCorner.y, newSelectedCorner.y),
            Math.max(fixedCorner.z, newSelectedCorner.z)
        );
        
        // 最小サイズ制限
        const minSize = 0.1;
        if (newMax.x - newMin.x < minSize) {
            if (xType === 'max') {
                newMax.x = newMin.x + minSize;
            } else {
                newMin.x = newMax.x - minSize;
            }
        }
        if (newMax.y - newMin.y < minSize) {
            if (yType === 'max') {
                newMax.y = newMin.y + minSize;
            } else {
                newMin.y = newMax.y - minSize;
            }
        }
        if (newMax.z - newMin.z < minSize) {
            if (zType === 'max') {
                newMax.z = newMin.z + minSize;
            } else {
                newMin.z = newMax.z - minSize;
            }
        }
        
        // 新しいサイズと中心を計算
        const newSize = new THREE.Vector3(
            newMax.x - newMin.x,
            newMax.y - newMin.y,
            newMax.z - newMin.z
        );
        
        const newCenter = new THREE.Vector3(
            (newMin.x + newMax.x) / 2,
            (newMin.y + newMax.y) / 2,
            (newMin.z + newMax.z) / 2
        );
        
        // 箱のジオメトリを更新
        this.updateBoxSizeGeometry(newSize, newCenter);
        
        console.log('バウンディングボックス変形:', {
            corner: userData.corner,
            deltaX: deltaX,
            deltaY: deltaY,
            worldMovement: worldMovement,
            fixedCorner: fixedCorner,
            newSelectedCorner: newSelectedCorner,
            newCenter: newCenter,
            newSize: newSize
        });
    }

    updateHandlePositions() {
        if (!this.trimBox) return;
        
        // 箱の回転とスケールを考慮したハンドル位置を計算
        const boxSize = new THREE.Vector3();
        this.trimBox.geometry.parameters ? 
            boxSize.set(
                this.trimBox.geometry.parameters.width / 2,
                this.trimBox.geometry.parameters.height / 2,
                this.trimBox.geometry.parameters.depth / 2
            ) : boxSize.setFromMatrixScale(this.trimBox.matrixWorld);
        
        const boxCenter = this.trimBox.position.clone();
        const boxRotation = this.trimBox.rotation.clone();
        
        // 頂点ハンドルの位置を更新
        this.cornerHandles.forEach(handle => {
            const userData = handle.userData;
            const parts = userData.corner.split('-');
            const cornerX = parts[0] === 'max' ? boxSize.x : -boxSize.x;
            const cornerY = parts[1] === 'max' ? boxSize.y : -boxSize.y;
            const cornerZ = parts[2] === 'max' ? boxSize.z : -boxSize.z;
            
            const localPos = new THREE.Vector3(cornerX, cornerY, cornerZ);
            localPos.applyEuler(boxRotation);
            localPos.add(boxCenter);
            handle.position.copy(localPos);
        });
        
        // 面ハンドルの位置を更新（選択されている場合のみ表示）
        this.faceHandles.forEach(handle => {
            const userData = handle.userData;
            let localPos = new THREE.Vector3();
            const offset = this.arrowOffset; // 箱から離す距離（クラスプロパティを使用）
            
            switch (userData.axis) {
                case 'x':
                    localPos.set(userData.direction * (boxSize.x + offset), 0, 0);
                    break;
                case 'y':
                    localPos.set(0, userData.direction * (boxSize.y + offset), 0);
                    break;
                case 'z':
                    localPos.set(0, 0, userData.direction * (boxSize.z + offset));
                    break;
            }
            
            localPos.applyEuler(boxRotation);
            localPos.add(boxCenter);
            handle.position.copy(localPos);
            
            // 矢印の向きも更新
            handle.rotation.set(0, 0, 0);
            this.orientArrowHandle(handle, userData);
            handle.rotation.y += boxRotation.y;
        });
        
        // エッジハンドル（円の4分の1）の位置を更新（箱の高さ中央）
        this.edgeHandles.forEach((handle, index) => {
            const userData = handle.userData;
            const edgeX = handle.userData.pos.x > boxCenter.x ? boxSize.x : -boxSize.x;
            const edgeZ = handle.userData.pos.z > boxCenter.z ? boxSize.z : -boxSize.z;
            
            // 箱の高さ中央（Y=0）に配置
            const localPos = new THREE.Vector3(edgeX, 0, edgeZ);
            localPos.applyEuler(boxRotation);
            localPos.add(boxCenter);
            handle.position.copy(localPos);
            
            // 箱に対する相対角度を維持（相対回転 + 箱の現在回転）
            if (this.initialEdgeRotations[index]) {
                // 相対回転のEuler角
                const relativeRotation = new THREE.Euler(
                    this.initialEdgeRotations[index].x,
                    this.initialEdgeRotations[index].y,
                    this.initialEdgeRotations[index].z
                );
                
                // 箱の回転と相対回転を合成
                const finalRotation = new THREE.Euler();
                finalRotation.setFromQuaternion(
                    new THREE.Quaternion()
                        .setFromEuler(boxRotation)
                        .multiply(new THREE.Quaternion().setFromEuler(relativeRotation))
                );
                
                handle.rotation.copy(finalRotation);
            }
        });
        
        // 回転軸の位置も更新
        this.rotationAxes.forEach((axis, index) => {
            if (index < this.edgeHandles.length) {
                axis.position.copy(this.edgeHandles[index].position);
            }
        });
    }

    updateBoxPosition(deltaX, deltaY) {
        // 箱全体の移動処理
        const camera = this.camera;
        const boxCenter = this.initialBoxPosition;
        const distance = camera.position.distanceTo(boxCenter);
        
        // カメラの右方向と上方向ベクトル
        const cameraRight = new THREE.Vector3();
        camera.getWorldDirection(cameraRight);
        cameraRight.cross(camera.up).normalize();
        const cameraUp = camera.up.clone();
        
        // スクリーン座標からワールド座標への変換倍率
        const fov = camera.fov * (Math.PI / 180);
        const viewportHeight = 2 * Math.tan(fov / 2) * distance;
        const viewportWidth = viewportHeight * camera.aspect;
        
        // マウス移動量をワールド座標での移動量に変換
        const sensitivity = 0.15; // 箱移動の感度
        const worldDeltaX = (deltaX * sensitivity) * viewportWidth;
        const worldDeltaY = (deltaY * sensitivity) * viewportHeight;
        
        // 3D空間での移動ベクトルを計算
        const worldMovement = new THREE.Vector3();
        worldMovement.addScaledVector(cameraRight, worldDeltaX);
        worldMovement.addScaledVector(cameraUp, worldDeltaY);
        
        // 新しい箱の位置を設定
        const newPosition = this.initialBoxPosition.clone().add(worldMovement);
        this.trimBox.position.copy(newPosition);
        
        // boxHelper（エッジライン）の位置も更新
        if (this.boxHelper) {
            this.boxHelper.position.copy(newPosition);
        }
        
        // ハンドルの位置も更新
        this.updateHandlePositions();
        
        console.log('箱移動:', { 
            deltaX, deltaY,
            worldDeltaX, worldDeltaY,
            newPosition: newPosition.toArray()
        });
    }

    getBoundingBox() {
        return this.trimBox ? new THREE.Box3().setFromObject(this.trimBox) : null;
    }

    disableOrbitControls() {
        if (this.controls) {
            this.controls.enabled = false;
            console.log('カメラコントロール無効化');
        }
    }

    enableOrbitControls() {
        if (this.controls) {
            this.controls.enabled = true;
            console.log('カメラコントロール有効化');
        }
    }

    showTrimmingInfo() {
        const infoElement = document.getElementById('trimmingInfo');
        if (infoElement) {
            infoElement.style.display = 'block';
        }
    }

    hideTrimmingInfo() {
        const infoElement = document.getElementById('trimmingInfo');
        if (infoElement) {
            infoElement.style.display = 'none';
        }
    }

    cancelTrimming() {
        if (this.isDragging && this.activeHandle) {
            // 箱移動モードの場合は色をリセット
            if (this.activeHandle.userData.type === 'boxMove') {
                this.setBoxMoveColors(false);
            } else {
                this.resetHandleColor(this.activeHandle);
            }
            this.activeHandle = null;
            this.isDragging = false;
            this.renderer.domElement.style.cursor = 'default';
            this.enableOrbitControls();
            this.hideTrimmingInfo();
            console.log('トリミング操作をキャンセル');
        }
    }

    setTrimBoxColor(colorHex) {
        this.boxColor = colorHex;
        
        // 既存の箱がある場合は色を更新
        if (this.trimBox && this.trimBox.material) {
            this.trimBox.material.color.setHex(colorHex);
        }
        
        if (this.boxHelper && this.boxHelper.material) {
            this.boxHelper.material.color.setHex(colorHex);
        }
    }

    setTrimBoxOpacity(opacity) {
        this.boxOpacity = Math.max(0, Math.min(1, opacity));
        
        // 既存の箱がある場合は透明度を更新
        if (this.trimBox && this.trimBox.material) {
            this.trimBox.material.opacity = this.boxOpacity;
        }
    }

    setEdgeRotationOffset(degrees) {
        this.edgeRotationOffset = degrees;
        this.updateHandlePositions();
        // 全エッジハンドルの初期回転を更新
        this.updateAllInitialEdgeRotations();
        console.log('エッジハンドル向き調整:', { degrees });
    }

    rotateEdgeHandles(degrees) {
        this.edgeRotationOffset += degrees;
        // -180から180の範囲に正規化
        while (this.edgeRotationOffset > 180) this.edgeRotationOffset -= 360;
        while (this.edgeRotationOffset < -180) this.edgeRotationOffset += 360;
        
        this.updateHandlePositions();
        // 全エッジハンドルの初期回転を更新
        this.updateAllInitialEdgeRotations();
        console.log('エッジハンドル回転:', { totalRotation: this.edgeRotationOffset });
        return this.edgeRotationOffset;
    }

    updateAllInitialEdgeRotations() {
        this.edgeHandles.forEach((handle, index) => {
            this.updateInitialEdgeRotation(index);
        });
    }

    resetEdgeRotation() {
        this.edgeRotationOffset = 0;
        this.updateHandlePositions();
        console.log('エッジハンドル向きリセット');
        return 0;
    }

    setIndividualEdgeYRotation(handleIndex, degrees) {
        if (handleIndex >= 0 && handleIndex < 4) {
            this.individualEdgeYRotations[handleIndex] = degrees;
            this.updateHandlePositions();
            // 初期回転も更新（向きを固定するため）
            this.updateInitialEdgeRotation(handleIndex);
            console.log(`エッジハンドル${handleIndex}のY軸調整:`, { degrees });
        }
    }

    setIndividualEdgeXRotation(handleIndex, degrees) {
        if (handleIndex >= 0 && handleIndex < 4) {
            this.individualEdgeXRotations[handleIndex] = degrees;
            this.updateHandlePositions();
            // 初期回転も更新（向きを固定するため）
            this.updateInitialEdgeRotation(handleIndex);
            console.log(`エッジハンドル${handleIndex}のX軸調整:`, { degrees });
        }
    }

    updateInitialEdgeRotation(handleIndex) {
        if (handleIndex >= 0 && handleIndex < this.edgeHandles.length && this.edgeHandles[handleIndex]) {
            const handle = this.edgeHandles[handleIndex];
            const boxRotation = this.trimBox ? this.trimBox.rotation : new THREE.Euler();
            
            // 現在の回転から箱の回転を除去して、相対角度を計算
            const boxQuaternion = new THREE.Quaternion().setFromEuler(boxRotation);
            const handleQuaternion = new THREE.Quaternion().setFromEuler(handle.rotation);
            
            // 相対回転 = 箱の逆回転 * ハンドルの現在回転
            const relativeQuaternion = boxQuaternion.clone().invert().multiply(handleQuaternion);
            const relativeEuler = new THREE.Euler().setFromQuaternion(relativeQuaternion);
            
            this.initialEdgeRotations[handleIndex] = {
                x: relativeEuler.x,
                y: relativeEuler.y,
                z: relativeEuler.z
            };
            console.log(`エッジハンドル${handleIndex}の相対回転更新:`, this.initialEdgeRotations[handleIndex]);
        }
    }

    resetIndividualEdgeRotation(handleIndex) {
        if (handleIndex >= 0 && handleIndex < 4) {
            this.individualEdgeYRotations[handleIndex] = 0;
            this.individualEdgeXRotations[handleIndex] = 0;
            this.updateHandlePositions();
            console.log(`エッジハンドル${handleIndex}向きリセット`);
            return { y: 0, x: 0 };
        }
        return { 
            y: this.individualEdgeYRotations[handleIndex] || 0,
            x: this.individualEdgeXRotations[handleIndex] || 0
        };
    }

    resetAllEdgeRotations() {
        this.edgeRotationOffset = 0;
        this.individualEdgeYRotations = [0, 0, 0, 0];
        this.individualEdgeXRotations = [0, 0, 0, 0];
        this.updateHandlePositions();
        console.log('全エッジハンドル向きリセット');
        return [0, 0, 0, 0];
    }

    getIndividualEdgeYRotation(handleIndex) {
        return this.individualEdgeYRotations[handleIndex] || 0;
    }

    getIndividualEdgeXRotation(handleIndex) {
        return this.individualEdgeXRotations[handleIndex] || 0;
    }

    clear() {
        // クリア時にカメラコントロールを再有効化
        this.enableOrbitControls();
        
        // 面選択をクリア
        this.deselectFace();
        
        if (this.trimBox) {
            this.scene.remove(this.trimBox);
            this.trimBox.geometry.dispose();
            this.trimBox.material.dispose();
            this.trimBox = null;
        }
        
        if (this.boxHelper) {
            this.scene.remove(this.boxHelper);
            this.boxHelper.geometry.dispose();
            this.boxHelper.material.dispose();
            this.boxHelper = null;
        }
        
        // 全てのハンドルをクリア
        [...this.handles, ...this.faceHandles, ...this.edgeHandles, ...this.cornerHandles].forEach(handle => {
            this.scene.remove(handle);
            
            // Groupの場合は子要素もクリア
            if (handle.type === 'Group') {
                handle.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) child.material.dispose();
                });
            } else {
                if (handle.geometry) handle.geometry.dispose();
                if (handle.material) handle.material.dispose();
            }
        });
        
        // 回転軸をクリア
        this.rotationAxes.forEach(axis => {
            this.scene.remove(axis);
            axis.children.forEach(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        });
        
        this.handles = [];
        this.faceHandles = [];
        this.edgeHandles = [];
        this.cornerHandles = [];
        this.rotationAxes = [];
        this.initialEdgeRotations = []; // 初期回転もクリア
    }

    updateBoxScaleGeometry() {
        if (!this.trimBox) return;
        
        // 固定サイズにスケールを適用
        const newBoxSize = this.fixedBoxSize * this.currentScale;
        
        // 箱のサイズを更新
        this.scene.remove(this.trimBox);
        this.scene.remove(this.boxHelper);
        this.trimBox.geometry.dispose();
        this.boxHelper.geometry.dispose();
        
        const geometry = new THREE.BoxGeometry(newBoxSize, newBoxSize, newBoxSize);
        this.trimBox.geometry = geometry;
        this.trimBox.position.copy(this.targetPosition);
        this.trimBox.material.color.setHex(this.boxColor); // 色を保持
        this.trimBox.material.opacity = this.boxOpacity; // 透明度を保持
        this.scene.add(this.trimBox);
        
        const edges = new THREE.EdgesGeometry(geometry);
        this.boxHelper.geometry = edges;
        this.boxHelper.position.copy(this.targetPosition);
        this.boxHelper.material.color.setHex(this.boxColor); // 色を保持
        this.scene.add(this.boxHelper);
        
        this.updateHandlePositions();
    }

    updateBoxSizeGeometry(newSize, center, preserveRotation = true) {
        if (!this.trimBox) return;
        
        // 現在の回転を保存
        const currentRotation = preserveRotation ? this.trimBox.rotation.clone() : new THREE.Euler();
        
        // 箱のサイズを更新
        this.scene.remove(this.trimBox);
        this.scene.remove(this.boxHelper);
        this.trimBox.geometry.dispose();
        this.boxHelper.geometry.dispose();
        
        const geometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);
        this.trimBox.geometry = geometry;
        this.trimBox.position.copy(center);
        this.trimBox.rotation.copy(currentRotation); // 回転を復元
        this.scene.add(this.trimBox);
        
        const edges = new THREE.EdgesGeometry(geometry);
        this.boxHelper.geometry = edges;
        this.boxHelper.position.copy(center);
        this.boxHelper.rotation.copy(currentRotation); // 回転を復元
        this.scene.add(this.boxHelper);
        
        // 位置を更新
        this.targetPosition.copy(center);
        
        // 現在の状態を保存（次回の操作で使用）
        this.currentBoxBounds = new THREE.Box3().setFromObject(this.trimBox);
        
        this.updateHandlePositions();
    }

    createRotationAxes() {
        // 各エッジハンドルの回転軸を作成
        this.edgeHandles.forEach((edgeHandle, index) => {
            const axisGroup = new THREE.Group();
            
            // Y軸（青色の線）
            const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, -0.2, 0),
                new THREE.Vector3(0, 0.2, 0)
            ]);
            const yAxisMaterial = new THREE.LineBasicMaterial({ 
                color: 0x0080ff, // 青色
                linewidth: 3,
                transparent: true,
                opacity: 0.8
            });
            const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
            axisGroup.add(yAxis);
            
            // X軸（赤色の線）
            const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(-0.2, 0, 0),
                new THREE.Vector3(0.2, 0, 0)
            ]);
            const xAxisMaterial = new THREE.LineBasicMaterial({ 
                color: 0xff6666, // 赤色
                linewidth: 3,
                transparent: true,
                opacity: 0.8
            });
            const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
            axisGroup.add(xAxis);
            
            // 軸グループの位置をエッジハンドルと同じに設定
            axisGroup.position.copy(edgeHandle.position);
            axisGroup.visible = this.showAxes;
            axisGroup.userData = { type: 'rotationAxis', handleIndex: index };
            
            this.scene.add(axisGroup);
            this.rotationAxes.push(axisGroup);
        });
    }

    setShowRotationAxes(show) {
        this.showAxes = show;
        this.rotationAxes.forEach(axis => {
            axis.visible = show;
        });
        console.log('回転軸表示:', show);
    }

    // 矢印サイズ変更メソッド（個別パラメータ）
    setArrowOffset(offset) {
        this.arrowOffset = offset;
        this.updateArrowSizes();
    }

    setArrowTipRadius(scale) {
        this.arrowTipRadius = scale;
        this.updateArrowSizes();
    }

    setArrowTipHeight(scale) {
        this.arrowTipHeight = scale;
        this.updateArrowSizes();
    }

    setArrowShaftRadius(scale) {
        this.arrowShaftRadius = scale;
        this.updateArrowSizes();
    }

    setArrowShaftHeight(scale) {
        this.arrowShaftHeight = scale;
        this.updateArrowSizes();
    }

    updateArrowSizes() {
        // すべての面ハンドル（矢印）を削除して再作成
        this.faceHandles.forEach(handle => {
            this.scene.remove(handle);
            // handlesからも削除
            const index = this.handles.indexOf(handle);
            if (index !== -1) {
                this.handles.splice(index, 1);
            }
        });
        this.faceHandles = [];

        // 新しいサイズで面ハンドルを再作成
        if (this.trimBox) {
            const box = new THREE.Box3().setFromObject(this.trimBox);
            const min = box.min;
            const max = box.max;
            const center = box.getCenter(new THREE.Vector3());

            // 面ハンドル（6つの面）- 箱の外側に少し出して配置
            const offset = this.arrowOffset; // 箱から離す距離（動的設定）
            const facePositions = [
                { pos: new THREE.Vector3(max.x + offset, center.y, center.z), type: 'face', axis: 'x', direction: 1 },
                { pos: new THREE.Vector3(min.x - offset, center.y, center.z), type: 'face', axis: 'x', direction: -1 },
                { pos: new THREE.Vector3(center.x, max.y + offset, center.z), type: 'face', axis: 'y', direction: 1 },
                { pos: new THREE.Vector3(center.x, min.y - offset, center.z), type: 'face', axis: 'y', direction: -1 },
                { pos: new THREE.Vector3(center.x, center.y, max.z + offset), type: 'face', axis: 'z', direction: 1 },
                { pos: new THREE.Vector3(center.x, center.y, min.z - offset), type: 'face', axis: 'z', direction: -1 }
            ];

            // 面ハンドルを作成（現在の可視性を保持）
            const shouldBeVisible = this.selectedFace !== null;
            
            facePositions.forEach(handleData => {
                // 新しい矢印Groupを作成
                const handle = this.createArrowGeometry();
                handle.position.copy(handleData.pos);
                handle.userData = handleData;
                handle.visible = shouldBeVisible; // 現在の表示状態を保持
                
                // 矢印を面の法線方向に向ける
                this.orientArrowHandle(handle, handleData);
                
                this.scene.add(handle);
                this.handles.push(handle);
                this.faceHandles.push(handle);
            });

            console.log('矢印サイズ更新完了:', {
                arrowOffset: this.arrowOffset,
                arrowTipRadius: this.arrowTipRadius,
                arrowTipHeight: this.arrowTipHeight,
                arrowShaftRadius: this.arrowShaftRadius,
                arrowShaftHeight: this.arrowShaftHeight,
                faceHandleCount: this.faceHandles.length,
                shouldBeVisible: shouldBeVisible
            });
        }
    }
}

class RealtimePreview {
    constructor() {
        this.originalModel = null;
        this.previewModel = null;
        this.outsideModel = null;
        this.outsideOpacity = 0.1; // 10%に変更
        this.showOutside = true;
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
        
        // 既存のモデルをクリーンアップ（previewModelとoutsideModel両方）
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

        const originalGeometry = this.originalModel.geometry;
        const positions = originalGeometry.attributes.position.array;
        const colors = originalGeometry.attributes.color?.array;
        
        // モデルの現在の回転を取得
        const modelRotation = this.originalModel.rotation;

        const insidePositions = [];
        const outsidePositions = [];
        const insideColors = [];
        const outsideColors = [];

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

            if (isInside) {
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

class TabManager {
    constructor(plyViewer) {
        this.plyViewer = plyViewer;
        this.tabs = [];
        this.activeTabId = null;
        this.nextTabId = 1;
        this.tabsList = document.getElementById('tabsList');
        
        this.init();
    }

    init() {
        this.createAddTabButton();
        // デフォルトタブを作成（最初に読み込み）
        this.loadDefaultTab();
    }

    createAddTabButton() {
        const addBtn = document.createElement('button');
        addBtn.className = 'add-tab-btn';
        addBtn.innerHTML = '+';
        addBtn.title = 'PLYファイルを追加';
        addBtn.addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        this.tabsList.appendChild(addBtn);
    }

    async loadDefaultTab() {
        try {
            const response = await fetch('./Scaniverse 2025-03-27 172709.ply');
            if (!response.ok) {
                console.warn('デフォルトPLYファイルが見つかりません');
                return;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const tab = this.createTab('デフォルト', './Scaniverse 2025-03-27 172709.ply', true);
            
            // PLYファイルを読み込み
            await this.plyViewer.loadPLYFromArrayBuffer(arrayBuffer, tab.id);
            
            // デフォルトモデルの向きを設定（等角 + x軸-90度）
            await this.setDefaultOrientation(tab.id);
            
            console.log('デフォルトPLYファイルを読み込みました');
        } catch (error) {
            console.error('デフォルトPLYファイルの読み込みエラー:', error);
        }
    }

    async setDefaultOrientation(tabId) {
        // 少し待ってからモデルの向きを設定（モデル読み込み完了を待つ）
        setTimeout(() => {
            if (!this.plyViewer.currentModel) return;

            // x軸に-90度回転を設定
            this.plyViewer.modelRotation.x = -Math.PI / 2;
            this.plyViewer.currentModel.rotation.copy(this.plyViewer.modelRotation);
            
            // 等角視点を設定
            this.plyViewer.setPresetView('iso');
            
            // タブデータを更新して向きを確定済みにマーク
            const tabData = this.plyViewer.tabData.get(tabId);
            if (tabData) {
                tabData.orientationConfirmed = true;
                tabData.modelRotation.copy(this.plyViewer.modelRotation);
                tabData.cameraPosition = this.plyViewer.camera.position.clone();
                tabData.cameraTarget = this.plyViewer.controls.target.clone();
                
                // 初期カメラ位置も更新
                this.plyViewer.initialCameraPosition.copy(this.plyViewer.camera.position);
                this.plyViewer.initialCameraTarget.copy(this.plyViewer.controls.target);
            }
            
            // コントロールを有効化
            this.plyViewer.enableControls();
            
            console.log('デフォルトモデルの向きを設定: 等角 + x軸-90度');
        }, 500); // 500ms待機
    }

    createTab(name, filePath = null, isDefault = false) {
        const tabId = this.nextTabId++;
        
        const tab = {
            id: tabId,
            name: name,
            filePath: filePath,
            isDefault: isDefault,
            data: null, // PLYデータを保存
            element: null
        };

        const tabElement = document.createElement('button');
        tabElement.className = `tab ${isDefault ? 'default' : ''}`;
        tabElement.dataset.tabId = tabId;
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.textContent = name;
        tabElement.appendChild(titleSpan);

        if (!isDefault) {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '×';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tabId);
            });
            tabElement.appendChild(closeBtn);
        }

        tabElement.addEventListener('click', () => {
            this.switchToTab(tabId);
        });

        tab.element = tabElement;
        this.tabs.push(tab);

        // 追加ボタンの前に挿入
        const addBtn = this.tabsList.querySelector('.add-tab-btn');
        this.tabsList.insertBefore(tabElement, addBtn);

        // 最初のタブまたは指定されたタブをアクティブにする
        if (this.tabs.length === 1 || isDefault) {
            this.switchToTab(tabId);
        }

        return tab;
    }

    switchToTab(tabId) {
        const tab = this.tabs.find(t => t.id === tabId);
        if (!tab) return;

        // すべてのタブからactiveクラスを削除
        this.tabs.forEach(t => {
            t.element.classList.remove('active');
        });

        // 選択されたタブにactiveクラスを追加
        tab.element.classList.add('active');
        this.activeTabId = tabId;

        // PLYViewerに対象のデータを設定
        this.plyViewer.switchToTabData(tab);

        console.log(`タブ切り替え: ${tab.name}`);
    }

    closeTab(tabId) {
        const tabIndex = this.tabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return;

        const tab = this.tabs[tabIndex];
        
        // デフォルトタブは閉じられない
        if (tab.isDefault) return;

        // タブ要素を削除
        tab.element.remove();

        // アクティブなタブを閉じる場合は別のタブに切り替え
        if (this.activeTabId === tabId) {
            // デフォルトタブに切り替え、または最初のタブに切り替え
            const defaultTab = this.tabs.find(t => t.isDefault);
            if (defaultTab) {
                this.switchToTab(defaultTab.id);
            } else if (this.tabs.length > 1) {
                const nextTab = tabIndex > 0 ? this.tabs[tabIndex - 1] : this.tabs[tabIndex + 1];
                if (nextTab) {
                    this.switchToTab(nextTab.id);
                }
            }
        }

        // タブリストから削除
        this.tabs.splice(tabIndex, 1);

        console.log(`タブを閉じました: ${tab.name}`);
    }

    addFileTab(file, arrayBuffer) {
        let fileName = file.name.replace('.ply', '');
        
        // ファイル名が長い場合は短縮
        if (fileName.length > 15) {
            fileName = fileName.substring(0, 12) + '...';
        }
        
        const tab = this.createTab(fileName, file.name);
        
        // PLYデータを保存
        tab.data = {
            file: file,
            arrayBuffer: arrayBuffer
        };

        // 新しいタブに切り替え
        this.switchToTab(tab.id);

        return tab;
    }

    getCurrentTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    getAllTabs() {
        return this.tabs;
    }
}

class PLYViewer {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.originalModel = null;
        this.currentModel = null;
        this.originalGeometry = null;
        this.isPointMode = true;
        
        this.trimBoxManipulator = null;
        this.realtimePreview = null;
        this.trimBoxVisible = false;
        
        // カメラの初期位置を保存
        this.initialCameraPosition = new THREE.Vector3();
        this.initialCameraTarget = new THREE.Vector3();
        
        // 向き調整関連
        this.isOrientationMode = false;
        this.modelRotation = new THREE.Euler();
        this.originalModelRotation = new THREE.Euler();
        
        // タブ管理機能
        this.tabManager = null;
        this.tabData = new Map(); // タブごとのデータを保存
        
        this.init();
        this.setupEventListeners();
        
        // TabManagerを初期化（初期化後に実行）
        setTimeout(() => {
            this.tabManager = new TabManager(this);
        }, 100);
    }

    init() {
        const viewer = document.getElementById('viewer');
        const rect = viewer.getBoundingClientRect();
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);
        
        this.camera = new THREE.PerspectiveCamera(
            75, 
            rect.width / rect.height, 
            0.1, 
            1000
        );
        this.camera.position.set(5, 5, 5);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(rect.width, rect.height);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        viewer.appendChild(this.renderer.domElement);
        
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enabled = true;
        
        const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 10, 5);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        this.trimBoxManipulator = new TrimBoxManipulator(this.scene, this.camera, this.renderer, this.controls, () => this.currentModel);
        this.realtimePreview = new RealtimePreview();
        
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupEventListeners() {
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const toggleDisplayMode = document.getElementById('toggleDisplayMode');
        const toggleTrimBox = document.getElementById('toggleTrimBox');
        const toggleOutsideView = document.getElementById('toggleOutsideView');
        const executeTrim = document.getElementById('executeTrim');
        const resetModel = document.getElementById('resetModel');
        const resetCamera = document.getElementById('resetCamera');

        fileInput.addEventListener('change', (e) => this.loadPLYFile(e.target.files[0]));
        
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.loadPLYFile(files[0]);
            }
        });

        toggleDisplayMode.addEventListener('click', () => this.toggleDisplayMode());
        toggleTrimBox.addEventListener('click', () => this.toggleTrimBox());
        toggleOutsideView.addEventListener('click', () => this.toggleOutsideView());
        
        executeTrim.addEventListener('click', () => this.executeTrim());
        resetModel.addEventListener('click', () => this.resetModel());
        resetCamera.addEventListener('click', () => this.resetCameraPosition());

        // 向き調整関連のイベントリスナー
        this.setupOrientationEventListeners();
    }

    async loadPLYFile(file) {
        if (!file || !file.name.toLowerCase().endsWith('.ply')) {
            alert('PLYファイルを選択してください');
            return;
        }

        if (file.size > 100 * 1024 * 1024) {
            alert('ファイルサイズが100MBを超えています');
            return;
        }

        try {
            // FileReaderを使ってArrayBufferを取得
            const arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
            
            // TabManagerがある場合は新しいタブを作成
            if (this.tabManager) {
                // 現在のタブデータを保存
                this.saveCurrentTabData();
                
                // 新しいタブを作成
                const tab = this.tabManager.addFileTab(file, arrayBuffer);
                
                // 新しいタブのPLYファイルを読み込み
                await this.loadPLYFromArrayBuffer(arrayBuffer, tab.id);
            } else {
                // TabManagerがない場合は従来の処理
                await this.loadPLYFromArrayBuffer(arrayBuffer, 1);
            }
            
        } catch (error) {
            console.error('PLYファイルの読み込みエラー:', error);
            alert('PLYファイルの読み込みに失敗しました: ' + error.message);
        }
    }

    createModel(geometry) {
        geometry.computeBoundingBox();
        
        let material;
        if (this.isPointMode) {
            material = new THREE.PointsMaterial({
                size: 0.035,
                vertexColors: geometry.attributes.color ? true : false,
                color: geometry.attributes.color ? 0xffffff : 0x00aaff
            });
            this.currentModel = new THREE.Points(geometry, material);
        } else {
            material = new THREE.MeshLambertMaterial({
                vertexColors: geometry.attributes.color ? true : false,
                color: geometry.attributes.color ? 0xffffff : 0x00aaff,
                side: THREE.DoubleSide
            });
            this.currentModel = new THREE.Mesh(geometry, material);
        }
        
        // 保存された向きがあれば適用
        if (!this.isOrientationMode && this.modelRotation) {
            this.currentModel.rotation.copy(this.modelRotation);
        }
        
        this.scene.add(this.currentModel);
        this.originalModel = this.currentModel.clone();
        this.realtimePreview.setOriginalModel(this.currentModel);
        
        console.log('モデル作成完了:', this.currentModel);
    }

    clearModel() {
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.currentModel.geometry.dispose();
            this.currentModel.material.dispose();
            this.currentModel = null;
        }
        if (this.originalModel) {
            this.originalModel.geometry.dispose();
            this.originalModel.material.dispose();
            this.originalModel = null;
        }
        
        this.trimBoxManipulator.clear();
        this.realtimePreview.clearPreview(this.scene);
        this.trimBoxVisible = false;
    }

    // タブ関連のメソッド
    async loadPLYFromArrayBuffer(arrayBuffer, tabId) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const dropZone = document.getElementById('dropZone');
        
        loadingIndicator.style.display = 'block';
        dropZone.classList.add('hidden');

        try {
            const loader = new PLYLoader();
            const geometry = loader.parse(arrayBuffer);
            
            if (!geometry.attributes.position) {
                throw new Error('無効なPLYファイル: 頂点データが見つかりません');
            }

            console.log('PLY読み込み成功:', {
                tabId: tabId,
                vertices: geometry.attributes.position.count,
                hasColors: !!geometry.attributes.color
            });

            // タブデータとして保存
            this.tabData.set(tabId, {
                originalGeometry: geometry.clone(),
                currentGeometry: geometry.clone(),
                modelRotation: new THREE.Euler(),
                originalModelRotation: new THREE.Euler(),
                cameraPosition: null,
                cameraTarget: null
            });

            // 現在のタブに切り替え
            this.switchToTabData(this.tabManager.getCurrentTab());
            
        } catch (error) {
            console.error('PLYファイルの読み込みエラー:', error);
            alert('PLYファイルの読み込みに失敗しました: ' + error.message);
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    switchToTabData(tab) {
        if (!tab) return;

        const tabData = this.tabData.get(tab.id);
        if (!tabData) {
            console.warn('タブデータが見つかりません:', tab.id);
            return;
        }

        // 現在のモデルをクリア
        this.clearModel();

        // タブのデータから復元
        this.originalGeometry = tabData.originalGeometry.clone();
        this.modelRotation.copy(tabData.modelRotation);
        this.originalModelRotation.copy(tabData.originalModelRotation);
        
        this.createModel(tabData.currentGeometry.clone());
        
        // カメラ位置が保存されている場合は復元
        if (tabData.cameraPosition && tabData.cameraTarget) {
            this.camera.position.copy(tabData.cameraPosition);
            this.controls.target.copy(tabData.cameraTarget);
            this.controls.update();
        } else {
            this.fitCameraToModel();
            // 初回の場合はカメラ位置を保存
            tabData.cameraPosition = this.camera.position.clone();
            tabData.cameraTarget = this.controls.target.clone();
        }

        this.updateUI();
        
        // 向き調整モードを開始（新しいタブで向きが未確定の場合）
        if (!tabData.orientationConfirmed) {
            // デフォルトタブの場合は向き調整をスキップ（自動設定されるため）
            if (tab.isDefault) {
                // デフォルトタブの場合は何もしない（setDefaultOrientationで処理される）
            } else {
                this.startOrientationMode();
            }
        } else {
            this.enableControls();
        }

        console.log('タブデータに切り替え:', { tabId: tab.id, name: tab.name });
    }

    saveCurrentTabData() {
        const currentTab = this.tabManager ? this.tabManager.getCurrentTab() : null;
        if (!currentTab) return;

        const tabData = this.tabData.get(currentTab.id);
        if (!tabData) return;

        // 現在の状態を保存
        if (this.currentModel) {
            tabData.currentGeometry = this.currentModel.geometry.clone();
            tabData.modelRotation.copy(this.modelRotation);
            tabData.originalModelRotation.copy(this.originalModelRotation);
        }
        
        tabData.cameraPosition = this.camera.position.clone();
        tabData.cameraTarget = this.controls.target.clone();

        console.log('現在のタブデータを保存:', currentTab.id);
    }

    fitCameraToModel() {
        if (!this.currentModel) return;
        
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / Math.sin(fov / 2)) * 2;
        
        this.camera.position.set(center.x, center.y, center.z + cameraZ);
        this.controls.target.copy(center);
        this.controls.update();
        
        // 初期位置を保存
        this.initialCameraPosition.copy(this.camera.position);
        this.initialCameraTarget.copy(this.controls.target);
        
        console.log('カメラ位置調整完了:', { center, size, cameraZ });
    }

    toggleDisplayMode() {
        if (!this.currentModel) return;
        
        // 現在の向きを保存
        const currentRotation = this.currentModel.rotation.clone();
        
        this.isPointMode = !this.isPointMode;
        const geometry = this.currentModel.geometry;
        
        this.scene.remove(this.currentModel);
        this.currentModel.material.dispose();
        
        let material;
        if (this.isPointMode) {
            material = new THREE.PointsMaterial({
                size: 0.035,
                vertexColors: geometry.attributes.color ? true : false,
                color: geometry.attributes.color ? 0xffffff : 0x00aaff
            });
            this.currentModel = new THREE.Points(geometry, material);
        } else {
            material = new THREE.MeshLambertMaterial({
                vertexColors: geometry.attributes.color ? true : false,
                color: geometry.attributes.color ? 0xffffff : 0x00aaff,
                side: THREE.DoubleSide
            });
            this.currentModel = new THREE.Mesh(geometry, material);
        }
        
        // 向きを復元
        this.currentModel.rotation.copy(currentRotation);
        
        this.scene.add(this.currentModel);
        this.realtimePreview.setOriginalModel(this.currentModel);
        
        const toggleButton = document.getElementById('toggleDisplayMode');
        toggleButton.textContent = this.isPointMode ? 'ポイント表示' : 'サーフェス表示';
        
        if (this.trimBoxVisible) {
            this.updatePreview();
        }
    }

    toggleTrimBox() {
        if (!this.currentModel) return;
        
        this.trimBoxVisible = !this.trimBoxVisible;
        
        if (this.trimBoxVisible) {
            // 回転を考慮したバウンディングボックスを取得
            this.currentModel.updateMatrixWorld();
            const boundingBox = new THREE.Box3().setFromObject(this.currentModel);
            this.trimBoxManipulator.create(boundingBox);
            this.updatePreview();
        } else {
            this.trimBoxManipulator.clear();
            this.realtimePreview.clearPreview(this.scene);
            this.realtimePreview.showOriginalModel();
            
            // 箱外モデル表示ボタンをリセット
            const toggleOutsideButton = document.getElementById('toggleOutsideView');
            toggleOutsideButton.textContent = '箱外モデル表示';
        }
        
        const toggleButton = document.getElementById('toggleTrimBox');
        toggleButton.textContent = this.trimBoxVisible ? 'トリミング箱非表示' : 'トリミング箱表示';
    }

    updatePreview() {
        if (this.trimBoxVisible && this.trimBoxManipulator.trimBox) {
            this.realtimePreview.hideOriginalModel();
            this.realtimePreview.updatePreview(this.scene, this.trimBoxManipulator.trimBox);
        }
    }

    executeTrim() {
        if (!this.currentModel || !this.trimBoxManipulator.trimBox) return;
        
        // トリミング箱の境界をワールド座標系で取得
        const trimBoxBounds = this.trimBoxManipulator.getBoundingBox();
        
        // 現在の向きを保存
        const currentRotation = this.currentModel.rotation.clone();
        
        const positions = this.currentModel.geometry.attributes.position.array;
        const colors = this.currentModel.geometry.attributes.color?.array;
        
        const newPositions = [];
        const newColors = [];
        let vertexCount = 0;
        
        // トリミング箱の逆変換行列を計算（箱の回転を考慮）
        const trimBoxMatrix = new THREE.Matrix4();
        trimBoxMatrix.makeRotationFromEuler(this.trimBoxManipulator.trimBox.rotation);
        trimBoxMatrix.setPosition(this.trimBoxManipulator.trimBox.position);
        const trimBoxInverseMatrix = trimBoxMatrix.clone().invert();
        
        // 各頂点をトリミング箱のローカル座標系で判定
        for (let i = 0; i < positions.length; i += 3) {
            // 元の頂点位置（ローカル座標）
            const localPoint = new THREE.Vector3(
                positions[i],
                positions[i + 1], 
                positions[i + 2]
            );
            
            // ローカル座標をワールド座標に変換（モデルの回転を適用）
            const worldPoint = localPoint.clone();
            worldPoint.applyEuler(currentRotation);
            
            // ワールド座標をトリミング箱のローカル座標系に変換
            const trimBoxLocalPoint = worldPoint.clone();
            trimBoxLocalPoint.applyMatrix4(trimBoxInverseMatrix);
            
            // トリミング箱のローカル座標系でのサイズ
            const trimBoxSize = new THREE.Vector3(
                this.trimBoxManipulator.trimBox.geometry.parameters.width / 2,
                this.trimBoxManipulator.trimBox.geometry.parameters.height / 2,
                this.trimBoxManipulator.trimBox.geometry.parameters.depth / 2
            );
            
            // ローカル座標系での判定
            if (Math.abs(trimBoxLocalPoint.x) <= trimBoxSize.x &&
                Math.abs(trimBoxLocalPoint.y) <= trimBoxSize.y &&
                Math.abs(trimBoxLocalPoint.z) <= trimBoxSize.z) {
                newPositions.push(positions[i], positions[i + 1], positions[i + 2]);
                vertexCount++;
                
                if (colors) {
                    newColors.push(colors[i], colors[i + 1], colors[i + 2]);
                }
            }
        }
        
        if (newPositions.length === 0) {
            alert('トリミング範囲内に頂点が見つかりません');
            return;
        }
        
        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
        
        if (newColors.length > 0) {
            newGeometry.setAttribute('color', new THREE.Float32BufferAttribute(newColors, 3));
        }
        
        this.scene.remove(this.currentModel);
        this.currentModel.geometry.dispose();
        this.currentModel.material.dispose();
        
        this.createModel(newGeometry);
        
        // 向きを復元
        this.currentModel.rotation.copy(currentRotation);
        this.modelRotation.copy(currentRotation);
        
        this.trimBoxManipulator.clear();
        this.realtimePreview.clearPreview(this.scene);
        this.trimBoxVisible = false;
        
        const toggleButton = document.getElementById('toggleTrimBox');
        toggleButton.textContent = 'トリミング箱表示';
        
        this.updateUI();
        
        console.log('トリミング完了 - 向きを保持:', {
            rotation: currentRotation,
            trimmedVertices: vertexCount,
            originalVertices: positions.length / 3
        });
    }

    resetModel() {
        if (!this.originalGeometry) return;
        
        // 現在の向きを保存
        const currentRotation = this.currentModel ? this.currentModel.rotation.clone() : new THREE.Euler();
        
        this.scene.remove(this.currentModel);
        this.currentModel.geometry.dispose();
        this.currentModel.material.dispose();
        
        this.createModel(this.originalGeometry.clone());
        
        // 向きを復元
        if (this.currentModel) {
            this.currentModel.rotation.copy(currentRotation);
            this.modelRotation.copy(currentRotation);
        }
        
        this.trimBoxManipulator.clear();
        this.realtimePreview.clearPreview(this.scene);
        this.trimBoxVisible = false;
        
        const toggleButton = document.getElementById('toggleTrimBox');
        toggleButton.textContent = 'トリミング箱表示';
        
        this.updateUI();
    }

    updateUI() {
        const originalCount = this.originalGeometry ? 
            this.originalGeometry.attributes.position.count : 0;
        const currentCount = this.currentModel ? 
            this.currentModel.geometry.attributes.position.count : 0;
        
        document.getElementById('originalVertexCount').textContent = 
            originalCount.toLocaleString();
        document.getElementById('currentVertexCount').textContent = 
            currentCount.toLocaleString();
    }

    updateTrimBoxInfo() {
        const trimBoxBounds = this.trimBoxManipulator.getBoundingBox();
        if (!trimBoxBounds) return;
        
        const min = trimBoxBounds.min;
        const max = trimBoxBounds.max;
        
        document.getElementById('trimBoxX').textContent = 
            `${min.x.toFixed(2)} - ${max.x.toFixed(2)}`;
        document.getElementById('trimBoxY').textContent = 
            `${min.y.toFixed(2)} - ${max.y.toFixed(2)}`;
        document.getElementById('trimBoxZ').textContent = 
            `${min.z.toFixed(2)} - ${max.z.toFixed(2)}`;
    }

    enableControls() {
        document.getElementById('toggleTrimBox').disabled = false;
        document.getElementById('toggleOutsideView').disabled = false;
        document.getElementById('executeTrim').disabled = false;
        document.getElementById('resetModel').disabled = false;
        document.getElementById('resetCamera').disabled = false;
    }

    toggleOutsideView() {
        if (!this.trimBoxVisible) return;
        
        const isVisible = this.realtimePreview.toggleOutsideVisibility();
        const toggleButton = document.getElementById('toggleOutsideView');
        toggleButton.textContent = isVisible ? '箱外モデル非表示' : '箱外モデル表示';
    }

    setOutsideOpacity(opacity) {
        if (this.realtimePreview) {
            this.realtimePreview.setOutsideOpacity(opacity);
        }
    }

    setTrimBoxColor(colorHex) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setTrimBoxColor(colorHex);
        }
    }

    setTrimBoxOpacity(opacity) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setTrimBoxOpacity(opacity);
        }
    }

    setEdgeRotationOffset(degrees) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setEdgeRotationOffset(degrees);
        }
    }

    rotateEdgeHandles(degrees) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.rotateEdgeHandles(degrees);
        }
        return 0;
    }

    resetEdgeRotation() {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.resetEdgeRotation();
        }
        return 0;
    }

    setIndividualEdgeYRotation(handleIndex, degrees) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setIndividualEdgeYRotation(handleIndex, degrees);
        }
    }

    setIndividualEdgeXRotation(handleIndex, degrees) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setIndividualEdgeXRotation(handleIndex, degrees);
        }
    }

    resetIndividualEdgeRotation(handleIndex) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.resetIndividualEdgeRotation(handleIndex);
        }
        return { y: 0, x: 0 };
    }

    resetAllEdgeRotations() {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.resetAllEdgeRotations();
        }
        return [0, 0, 0, 0];
    }

    getIndividualEdgeYRotation(handleIndex) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.getIndividualEdgeYRotation(handleIndex);
        }
        return 0;
    }

    getIndividualEdgeXRotation(handleIndex) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.getIndividualEdgeXRotation(handleIndex);
        }
        return 0;
    }

    resetCameraPosition() {
        if (!this.currentModel) return;
        
        // 保存された初期位置に戻す
        this.camera.position.copy(this.initialCameraPosition);
        this.controls.target.copy(this.initialCameraTarget);
        this.controls.update();
        
        console.log('カメラ位置をリセット:', {
            position: this.initialCameraPosition,
            target: this.initialCameraTarget
        });
    }

    setupOrientationEventListeners() {
        // プリセット視点
        document.getElementById('presetFront').addEventListener('click', () => this.setPresetView('front'));
        document.getElementById('presetTop').addEventListener('click', () => this.setPresetView('top'));
        document.getElementById('presetSide').addEventListener('click', () => this.setPresetView('side'));
        document.getElementById('presetIso').addEventListener('click', () => this.setPresetView('iso'));

        // 回転操作
        document.getElementById('rotateXPos').addEventListener('click', () => this.rotateModel('x', Math.PI / 2));
        document.getElementById('rotateXNeg').addEventListener('click', () => this.rotateModel('x', -Math.PI / 2));
        document.getElementById('rotateYPos').addEventListener('click', () => this.rotateModel('y', Math.PI / 2));
        document.getElementById('rotateYNeg').addEventListener('click', () => this.rotateModel('y', -Math.PI / 2));
        document.getElementById('rotateZPos').addEventListener('click', () => this.rotateModel('z', Math.PI / 2));
        document.getElementById('rotateZNeg').addEventListener('click', () => this.rotateModel('z', -Math.PI / 2));

        // 反転操作
        document.getElementById('flipX').addEventListener('click', () => this.rotateModel('x', Math.PI));
        document.getElementById('flipY').addEventListener('click', () => this.rotateModel('y', Math.PI));
        document.getElementById('flipZ').addEventListener('click', () => this.rotateModel('z', Math.PI));

        // 確定・リセット
        document.getElementById('resetOrientation').addEventListener('click', () => this.resetOrientation());
        document.getElementById('confirmOrientation').addEventListener('click', () => this.confirmOrientation());
    }

    startOrientationMode() {
        this.isOrientationMode = true;
        document.getElementById('orientationModal').style.display = 'block';
        
        // 元の回転を保存
        if (this.currentModel) {
            this.originalModelRotation.copy(this.currentModel.rotation);
            this.modelRotation.set(0, 0, 0);
        }
        
        console.log('向き調整モード開始');
    }

    setPresetView(viewType) {
        if (!this.currentModel) return;

        const box = new THREE.Box3().setFromObject(this.currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const distance = maxDim * 2.5;

        switch (viewType) {
            case 'front':
                this.camera.position.set(center.x, center.y, center.z + distance);
                break;
            case 'top':
                this.camera.position.set(center.x, center.y + distance, center.z);
                break;
            case 'side':
                this.camera.position.set(center.x + distance, center.y, center.z);
                break;
            case 'iso':
                this.camera.position.set(
                    center.x + distance * 0.7,
                    center.y + distance * 0.7,
                    center.z + distance * 0.7
                );
                break;
        }

        this.controls.target.copy(center);
        this.controls.update();
    }

    rotateModel(axis, angle) {
        if (!this.currentModel) return;

        // 現在の回転に追加
        switch (axis) {
            case 'x':
                this.modelRotation.x += angle;
                break;
            case 'y':
                this.modelRotation.y += angle;
                break;
            case 'z':
                this.modelRotation.z += angle;
                break;
        }

        this.currentModel.rotation.copy(this.modelRotation);
        console.log(`${axis}軸に${(angle * 180 / Math.PI)}度回転`);
    }

    resetOrientation() {
        if (!this.currentModel) return;

        this.modelRotation.set(0, 0, 0);
        this.currentModel.rotation.copy(this.modelRotation);
        
        // カメラも初期位置に戻す
        this.fitCameraToModel();
        
        console.log('向きをリセット');
    }

    confirmOrientation() {
        this.isOrientationMode = false;
        document.getElementById('orientationModal').style.display = 'none';
        
        // 確定された向きで初期位置を再保存
        this.initialCameraPosition.copy(this.camera.position);
        this.initialCameraTarget.copy(this.controls.target);
        
        // タブデータを更新
        const currentTab = this.tabManager ? this.tabManager.getCurrentTab() : null;
        if (currentTab) {
            const tabData = this.tabData.get(currentTab.id);
            if (tabData) {
                tabData.orientationConfirmed = true;
                tabData.modelRotation.copy(this.modelRotation);
                tabData.cameraPosition = this.initialCameraPosition.clone();
                tabData.cameraTarget = this.initialCameraTarget.clone();
            }
        }
        
        // コントロールを有効化
        this.enableControls();
        
        console.log('向きを確定:', {
            rotation: this.modelRotation,
            camera: this.initialCameraPosition,
            tabId: currentTab ? currentTab.id : null
        });
    }

    setupArrowSizeSliders() {
        // スライダー要素を取得
        const arrowOffsetSlider = document.getElementById('arrowOffsetSlider');
        const arrowTipRadiusSlider = document.getElementById('arrowTipRadiusSlider');
        const arrowTipHeightSlider = document.getElementById('arrowTipHeightSlider');
        const arrowShaftRadiusSlider = document.getElementById('arrowShaftRadiusSlider');
        const arrowShaftHeightSlider = document.getElementById('arrowShaftHeightSlider');
        
        // 値表示要素を取得
        const arrowOffsetValue = document.getElementById('arrowOffsetValue');
        const arrowTipRadiusValue = document.getElementById('arrowTipRadiusValue');
        const arrowTipHeightValue = document.getElementById('arrowTipHeightValue');
        const arrowShaftRadiusValue = document.getElementById('arrowShaftRadiusValue');
        const arrowShaftHeightValue = document.getElementById('arrowShaftHeightValue');

        // 要素が見つからない場合は警告
        if (!arrowOffsetSlider || !arrowTipRadiusSlider || !arrowTipHeightSlider || 
            !arrowShaftRadiusSlider || !arrowShaftHeightSlider) {
            console.warn('矢印サイズスライダーが見つかりません');
            return;
        }

        // 始まり位置（箱からの距離）スライダー
        arrowOffsetSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            arrowOffsetValue.textContent = value.toFixed(2);
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.setArrowOffset(value);
            }
        });

        // 先端の大きさ（円錐の半径）スライダー
        arrowTipRadiusSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            arrowTipRadiusValue.textContent = value.toFixed(1);
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.setArrowTipRadius(value);
            }
        });

        // 先端の高さ（円錐の高さ）スライダー
        arrowTipHeightSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            arrowTipHeightValue.textContent = value.toFixed(1);
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.setArrowTipHeight(value);
            }
        });

        // 線の太さ（円柱の半径）スライダー
        arrowShaftRadiusSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            arrowShaftRadiusValue.textContent = value.toFixed(1);
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.setArrowShaftRadius(value);
            }
        });

        // 線の長さ（円柱の高さ）スライダー
        arrowShaftHeightSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            arrowShaftHeightValue.textContent = value.toFixed(1);
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.setArrowShaftHeight(value);
            }
        });

        console.log('矢印サイズスライダー設定完了（個別パラメータ対応）');
    }

    onWindowResize() {
        const viewer = document.getElementById('viewer');
        const rect = viewer.getBoundingClientRect();
        
        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        if (this.trimBoxVisible) {
            this.updateTrimBoxInfo();
            
            if (this.trimBoxManipulator.isDragging) {
                this.updatePreview();
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        new PLYViewer();
        console.log('PLY Viewer初期化完了');
    } catch (error) {
        console.error('PLY Viewer初期化エラー:', error);
    }
});