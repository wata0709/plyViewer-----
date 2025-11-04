import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TrimBoxManipulator } from './TrimBoxManipulator.js';
import { RealtimePreview } from './RealtimePreview.js';
import { TabManager } from './TabManager.js';

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
        
        // 天球関連
        this.skyboxSphere = null;
        this.skyboxVisible = true; // 初期状態でON
        this.defaultBackgroundColor = new THREE.Color(0x222222);
        
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
        this.scene.background = this.defaultBackgroundColor;
        
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
        
        // 初期化時にトリミングボックスをクリア（念のため）
        this.trimBoxManipulator.clear();
        this.trimBoxVisible = false;
        
        // 天球を初期化
        this.initSkybox();
        
        this.animate();
        
        window.addEventListener('resize', () => this.onWindowResize());

        // 設定UIの初期表示値をマニピュレータから反映
        const arrowHeadSize = document.getElementById('arrowHeadSize');
        const arrowHeadSizeValue = document.getElementById('arrowHeadSizeValue');

        if (arrowHeadSize && arrowHeadSizeValue) {
            arrowHeadSize.value = this.trimBoxManipulator.coneHeight.toFixed(2);
            arrowHeadSizeValue.textContent = this.trimBoxManipulator.coneHeight.toFixed(2);
        }
    }

    setupEventListeners() {
        const fileInput = document.getElementById('fileInput');
        const dropZone = document.getElementById('dropZone');
        const toggleDisplayMode = document.getElementById('toggleDisplayMode');
        const toggleSkybox = document.getElementById('toggleSkybox');
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
        toggleSkybox.addEventListener('change', (e) => this.toggleSkybox(e.target.checked));
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
        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            console.error('createModel: 無効なジオメトリ');
            return;
        }

        // モデル作成時に既存のトリミングボックスをクリア
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.clear();
        }
        this.trimBoxVisible = false;

        try {
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
        } catch (error) {
            console.error('モデル作成エラー:', error);
            this.currentModel = null;
            this.originalModel = null;
        }
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
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                throw new Error('無効なデータ: ArrayBufferが空です');
            }

            const loader = new PLYLoader();
            const geometry = loader.parse(arrayBuffer);
            
            if (!geometry || !geometry.attributes || !geometry.attributes.position) {
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
            // エラー時は現在のモデルをクリアして安全な状態に戻す
            this.clearModel();
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    switchToTabData(tab) {
        if (!tab) {
            console.warn('switchToTabData: tabがnullです');
            return;
        }

        const tabData = this.tabData.get(tab.id);
        if (!tabData) {
            console.warn('タブデータが見つかりません:', tab.id);
            return;
        }

        if (!tabData.currentGeometry || !tabData.currentGeometry.attributes) {
            console.error('switchToTabData: 無効なジオメトリデータ');
            return;
        }

        // 現在のモデルをクリア
        this.clearModel();

        // タブのデータから復元
        this.originalGeometry = tabData.originalGeometry.clone();
        this.modelRotation.copy(tabData.modelRotation);
        this.originalModelRotation.copy(tabData.originalModelRotation);
        
        this.createModel(tabData.currentGeometry.clone());
        
        // createModelが失敗した場合は処理を中断
        if (!this.currentModel) {
            console.error('switchToTabData: モデルの作成に失敗しました');
            return;
        }
        
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
        let cameraZ = Math.abs(maxDim / Math.sin(fov / 2)) * 0.5; // より近い位置から開始（元は*2）
        
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
        if (!this.currentModel) {
            console.warn('toggleTrimBox: currentModelが存在しません');
            return;
        }
        
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
        toggleButton.textContent = this.trimBoxVisible ? 'スライスを中止する' : 'スライス';
    }

    updatePreview() {
        if (!this.currentModel) {
            console.warn('updatePreview: currentModelが存在しません');
            return;
        }
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
        toggleButton.textContent = 'スライス';
        
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
        toggleButton.textContent = 'スライス';
        
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
        
        // ハンドルサイズ（ピクセル）を更新
        this.updateHandlePixelSize();
    }
    
    updateHandlePixelSize() {
        if (!this.trimBoxManipulator || !this.camera || !this.renderer) return;
        
        const manipulator = this.trimBoxManipulator;
        const edgeHandles = manipulator.edgeHandles;
        
        if (edgeHandles.length === 0) {
            const element = document.getElementById('handlePixelSize');
            if (element) element.textContent = '-';
            return;
        }
        
        // 最初のエッジハンドルを使用してサイズを計算
        const handle = edgeHandles[0];
        if (!handle || handle.children.length === 0) {
            const element = document.getElementById('handlePixelSize');
            if (element) element.textContent = '-';
            return;
        }
        
        // ハンドルのバウンディングボックスを取得
        const box = new THREE.Box3().setFromObject(handle);
        if (!box.isEmpty()) {
            // バウンディングボックスの8つの頂点をスクリーン座標に投影
            const corners = [
                new THREE.Vector3(box.min.x, box.min.y, box.min.z),
                new THREE.Vector3(box.max.x, box.min.y, box.min.z),
                new THREE.Vector3(box.min.x, box.max.y, box.min.z),
                new THREE.Vector3(box.max.x, box.max.y, box.min.z),
                new THREE.Vector3(box.min.x, box.min.y, box.max.z),
                new THREE.Vector3(box.max.x, box.min.y, box.max.z),
                new THREE.Vector3(box.min.x, box.max.y, box.max.z),
                new THREE.Vector3(box.max.x, box.max.y, box.max.z)
            ];
            
            const screenCorners = corners.map(corner => {
                // ワールド座標に変換
                const worldPos = corner.clone();
                handle.localToWorld(worldPos);
                
                // スクリーン座標に投影
                const screenPos = worldPos.project(this.camera);
                
                // ピクセル座標に変換
                const rect = this.renderer.domElement.getBoundingClientRect();
                return new THREE.Vector2(
                    (screenPos.x * 0.5 + 0.5) * rect.width,
                    (screenPos.y * -0.5 + 0.5) * rect.height
                );
            });
            
            // スクリーン上の最小・最大座標を取得
            const minX = Math.min(...screenCorners.map(c => c.x));
            const maxX = Math.max(...screenCorners.map(c => c.x));
            const minY = Math.min(...screenCorners.map(c => c.y));
            const maxY = Math.max(...screenCorners.map(c => c.y));
            
            // ピクセルサイズを計算
            const pixelWidth = Math.abs(maxX - minX);
            const pixelHeight = Math.abs(maxY - minY);
            const pixelSize = Math.max(pixelWidth, pixelHeight); // より大きい方を表示
            
            const element = document.getElementById('handlePixelSize');
            if (element) {
                element.textContent = `${pixelSize.toFixed(1)}px`;
            }
        } else {
            const element = document.getElementById('handlePixelSize');
            if (element) element.textContent = '-';
        }
    }

    enableControls() {
        // currentModelが存在する場合のみコントロールを有効化
        if (this.currentModel) {
            document.getElementById('toggleTrimBox').disabled = false;
            document.getElementById('toggleOutsideView').disabled = false;
            document.getElementById('executeTrim').disabled = false;
            document.getElementById('resetModel').disabled = false;
            document.getElementById('resetCamera').disabled = false;
        }
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



    setBoundaryThreshold(threshold) {
        if (this.realtimePreview) {
            this.realtimePreview.setBoundaryThreshold(threshold);
            this.updatePreview(); // 閾値変更時はプレビューを更新
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

    setIndividualEdgeZRotation(handleIndex, degrees) {
        if (this.trimBoxManipulator) {
            this.trimBoxManipulator.setIndividualEdgeZRotation(handleIndex, degrees);
        }
    }

    resetIndividualEdgeRotation(handleIndex) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.resetIndividualEdgeRotation(handleIndex);
        }
        return { y: 0, x: 0, z: 0 };
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

    getIndividualEdgeZRotation(handleIndex) {
        if (this.trimBoxManipulator) {
            return this.trimBoxManipulator.getIndividualEdgeZRotation(handleIndex);
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

    // 天球を初期化
    initSkybox() {
        const loader = new THREE.TextureLoader();
        loader.load(
            'pic/background-type2-1.png',
            (texture) => {
                // テクスチャの設定を調整して画像をそのまま表示
                texture.colorSpace = THREE.SRGBColorSpace; // sRGB色空間を使用（そのままの色で表示）
                texture.flipY = true; // Y軸を反転して正しい向きに
                this.createSkybox(texture);
                console.log('天球画像の読み込み完了');
            },
            (progress) => {
                console.log('天球画像読み込み中:', progress);
            },
            (error) => {
                console.warn('天球画像の読み込みに失敗:', error);
            }
        );
    }

    // 天球を作成
    createSkybox(texture) {
        // 球体ジオメトリを作成（内側から見るため、スケールをマイナスにする）
        const geometry = new THREE.SphereGeometry(500, 60, 40);
        geometry.scale(-1, 1, 1); // X軸を反転して内側から見えるようにする

        // マテリアルを作成
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            side: THREE.FrontSide, // スケール反転しているのでFrontSideを使用
            depthWrite: false, // 天球は深度バッファに書き込まない
            toneMapped: false // トーンマッピングを無効にして画像をそのまま表示
        });

        // 天球メッシュを作成
        this.skyboxSphere = new THREE.Mesh(geometry, material);
        this.skyboxSphere.visible = this.skyboxVisible;
        this.skyboxSphere.renderOrder = -1; // 最初に描画
        
        // シーンに追加
        this.scene.add(this.skyboxSphere);
        
        // 初期状態で天球がONの場合、背景色を無効にする
        if (this.skyboxVisible) {
            this.scene.background = null;
        }
        
        console.log('天球作成完了', {
            textureLoaded: texture !== null,
            textureSize: texture.image ? `${texture.image.width}x${texture.image.height}` : 'unknown'
        });
    }

    // 天球の表示/非表示を切り替え
    toggleSkybox(checked) {
        // チェックボックスの状態を引数で受け取る（未指定の場合はトグル）
        if (checked === undefined) {
            this.skyboxVisible = !this.skyboxVisible;
        } else {
            this.skyboxVisible = checked;
        }
        
        if (this.skyboxSphere) {
            this.skyboxSphere.visible = this.skyboxVisible;
        }
        
        // 背景色も切り替え
        if (this.skyboxVisible) {
            this.scene.background = null; // 天球表示時は背景色を無効
        } else {
            this.scene.background = this.defaultBackgroundColor; // デフォルト背景色に戻す
        }
        
        // チェックボックスの状態を更新
        const toggleCheckbox = document.getElementById('toggleSkybox');
        if (toggleCheckbox) {
            toggleCheckbox.checked = this.skyboxVisible;
        }
        
        console.log('天球表示状態:', this.skyboxVisible);
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
        // fitCameraToModel()と同じ計算方法を使用して、近い位置から開始
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.5;

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
        console.log('円錐サイズスライダー設定開始');
        
        // スライダー要素を取得
        const arrowOffsetSlider = document.getElementById('arrowOffsetSlider');
        const coneRadiusSlider = document.getElementById('coneRadiusSlider');
        const coneHeightSlider = document.getElementById('coneHeightSlider');
        
        // 値表示要素を取得
        const arrowOffsetValue = document.getElementById('arrowOffsetValue');
        const coneRadiusValue = document.getElementById('coneRadiusValue');
        const coneHeightValue = document.getElementById('coneHeightValue');

        console.log('要素の存在確認:', {
            arrowOffsetSlider: !!arrowOffsetSlider,
            coneRadiusSlider: !!coneRadiusSlider,
            coneHeightSlider: !!coneHeightSlider,
            arrowOffsetValue: !!arrowOffsetValue,
            coneRadiusValue: !!coneRadiusValue,
            coneHeightValue: !!coneHeightValue
        });

        // 要素が見つからない場合は警告
        if (!arrowOffsetSlider || !coneRadiusSlider || !coneHeightSlider) {
            console.warn('円錐サイズスライダーが見つかりません');
            return;
        }

        // 始まり位置（箱からの距離）スライダー
        arrowOffsetSlider.addEventListener('input', (e) => {
            try {
                const value = parseFloat(e.target.value);
                if (arrowOffsetValue) arrowOffsetValue.textContent = value.toFixed(2);
                if (this.trimBoxManipulator) {
                    console.log('箱からの距離設定:', value);
                    this.trimBoxManipulator.setArrowOffset(value);
                } else {
                    console.warn('trimBoxManipulatorが存在しません');
                }
            } catch (error) {
                console.error('箱からの距離設定エラー:', error);
            }
        });

        // 円錐の半径スライダー
        coneRadiusSlider.addEventListener('input', (e) => {
            try {
                const value = parseFloat(e.target.value);
                if (coneRadiusValue) coneRadiusValue.textContent = value.toFixed(3);
                if (this.trimBoxManipulator) {
                    console.log('円錐半径設定:', value);
                    this.trimBoxManipulator.setConeRadius(value);
                } else {
                    console.warn('trimBoxManipulatorが存在しません');
                }
            } catch (error) {
                console.error('円錐半径設定エラー:', error);
            }
        });

        // 円錐の高さスライダー
        coneHeightSlider.addEventListener('input', (e) => {
            try {
                const value = parseFloat(e.target.value);
                if (coneHeightValue) coneHeightValue.textContent = value.toFixed(3);
                if (this.trimBoxManipulator) {
                    console.log('円錐高さ設定:', value);
                    this.trimBoxManipulator.setConeHeight(value);
                } else {
                    console.warn('trimBoxManipulatorが存在しません');
                }
            } catch (error) {
                console.error('円錐高さ設定エラー:', error);
            }
        });

        console.log('円錐サイズスライダー設定完了');
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
            
            // 矢印を常にカメラに向ける
            if (this.trimBoxManipulator) {
                this.trimBoxManipulator.updateArrowOrientations();
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

export { PLYViewer };
