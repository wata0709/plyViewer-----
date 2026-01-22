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
        this.boundaryDisplayModel = null; // スライス実行後の境界表示用
        
        // カメラの初期位置を保存
        this.initialCameraPosition = new THREE.Vector3();
        this.initialCameraTarget = new THREE.Vector3();
        
        // 向き調整関連
        this.isOrientationMode = false;
        this.modelRotation = new THREE.Euler();
        this.originalModelRotation = new THREE.Euler();
        
        // モデル位置オフセット
        this.modelPositionOffset = new THREE.Vector3(0, 0, 0); // モデルの位置オフセット（Y軸方向に上げる場合はy値を変更）
        
        // タブ管理機能
        this.tabManager = null;
        this.tabData = new Map(); // タブごとのデータを保存
        
        // 天球関連
        this.skyboxSphere = null;
        this.skyboxVisible = true; // 初期状態でON
        this.defaultBackgroundColor = new THREE.Color(0x222222);
        this.skyboxTexture = null; // 天球のテクスチャを保持
        
        // グリッド関連
        this.gridMesh = null;
        
        // モード関連
        this.currentMode = '3d'; // '3d' または 'walkthrough'
        this.currentViewMode = 'look'; // 'orbit', 'look', 'third'
        
        this.init();
        this.setupEventListeners();
        
        // デフォルトPLYファイルを読み込む（TabManagerを使わない）
        setTimeout(() => {
            this.loadDefaultPLY();
        }, 200);
    }
    
    async loadDefaultPLY() {
        const defaultPLYPath = 'Scaniverse 2024-07-21 155128.ply';
        
        try {
            console.log('デフォルトPLYファイルを読み込み中:', defaultPLYPath);
            
            const response = await fetch(defaultPLYPath);
            if (!response.ok) {
                console.warn('デフォルトPLYファイルが見つかりません:', defaultPLYPath);
                return;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                console.error('デフォルトPLYファイルが空です');
                return;
            }
            
            // 直接PLYファイルを読み込む
            await this.loadPLYFromArrayBuffer(arrayBuffer);
            
            // デフォルトモデルの向きを設定（等角 + x軸-90度）
            setTimeout(() => {
                if (!this.currentModel) return;
                
                // x軸に-90度回転を設定
                this.modelRotation.x = -Math.PI / 2;
                this.currentModel.rotation.copy(this.modelRotation);
                
                // 等角視点を設定
                this.setPresetView('iso');
                
                // ブラウザ読み込み時の初期カメラ位置として保存（等角視点の位置）
                this.initialCameraPosition.copy(this.camera.position);
                this.initialCameraTarget.copy(this.controls.target);
                
                console.log('デフォルトモデルの向きを設定: 等角 + x軸-90度', {
                    initialCameraPosition: this.initialCameraPosition,
                    initialCameraTarget: this.initialCameraTarget
                });
                
                // コントロールを有効化
                this.enableControls();
            }, 500);
            
            console.log('デフォルトPLYファイルを読み込みました');
        } catch (error) {
            console.error('デフォルトPLYファイルの読み込みエラー:', error);
        }
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
        
        // 新しいUI要素
        const toggleTrimBoxNew = document.getElementById('toggleTrimBoxNew');
        const toggleOutsideViewNew = document.getElementById('toggleOutsideViewNew');
        const completeSliceBtn = document.getElementById('completeSliceBtn');
        const cancelSliceBtn = document.getElementById('cancelSliceBtn');
        const fullRangeSliceBtn = document.getElementById('fullRangeSliceBtn');
        const optionPanel = document.getElementById('optionPanel');
        
        // 旧UI要素（後方互換性のため残す）
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

        // 新しいUI要素のイベントリスナー
        if (toggleTrimBoxNew) {
            toggleTrimBoxNew.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('スライスボタンがクリックされました');
                
                // スライスモードで表示中の場合は、モデル全体を復元してからスライスモードに入る
                const sliceViewMode = document.getElementById('sliceViewMode');
                if (sliceViewMode && sliceViewMode.style.display !== 'none') {
                    // モデル全体を表示する初期状態に戻す
                    this.resetModel();
                    // スライス完了時のUIを非表示
                    sliceViewMode.style.display = 'none';
                    // スライスモードに入る
                    this.toggleTrimBox();
                    return;
                }
                
                // スライス中（trimBoxVisibleがtrue）の場合は何もしない
                if (this.trimBoxVisible) {
                    console.log('スライス中なのでスライスボタンは無効です');
                    return;
                }
                
                this.toggleTrimBox();
            });
        } else {
            console.warn('toggleTrimBoxNew要素が見つかりません');
        }
        if (toggleOutsideViewNew) {
            toggleOutsideViewNew.addEventListener('change', (e) => {
                this.toggleOutsideView();
                toggleOutsideViewNew.checked = this.realtimePreview.showOutside;
            });
        }

        // スライスモード中の天球トグル
        const toggleSkyboxSlice = document.getElementById('toggleSkyboxSlice');
        if (toggleSkyboxSlice) {
            toggleSkyboxSlice.addEventListener('change', (e) => {
                this.toggleSkyboxInSliceMode(e.target.checked);
            });
        }

        // 矢印タイプの切り替え
        const arrowTypeSelect = document.getElementById('arrowTypeSelect');
        if (arrowTypeSelect) {
            arrowTypeSelect.addEventListener('change', (e) => {
                this.changeArrowType(e.target.value);
            });
        }

        // arrow_cornクリック可能領域表示切り替えトグル
        const toggleArrowCornClickable = document.getElementById('toggleArrowCornClickable');
        if (toggleArrowCornClickable) {
            toggleArrowCornClickable.addEventListener('change', (e) => {
                this.setArrowCornClickableVisible(e.target.checked);
            });
        }

        // arrow_corn専用の面の矢印の位置調整スライダー
        const faceArrowInnerOffsetSlider = document.getElementById('faceArrowInnerOffsetSlider');
        const faceArrowInnerOffsetInput = document.getElementById('faceArrowInnerOffsetInput');
        if (faceArrowInnerOffsetSlider && faceArrowInnerOffsetInput) {
            // スライダー変更時
            faceArrowInnerOffsetSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                faceArrowInnerOffsetInput.value = value.toFixed(1);
                this.setFaceArrowInnerOffset(value);
            });
            
            // 数値入力変更時
            faceArrowInnerOffsetInput.addEventListener('input', (e) => {
                let value = parseFloat(e.target.value);
                if (isNaN(value)) return;
                // 範囲制限
                value = Math.max(0, Math.min(2, value));
                faceArrowInnerOffsetSlider.value = value;
                e.target.value = value.toFixed(1);
                this.setFaceArrowInnerOffset(value);
            });
            
            // 数値入力フォーカスアウト時（確定）
            faceArrowInnerOffsetInput.addEventListener('blur', (e) => {
                let value = parseFloat(e.target.value);
                if (isNaN(value)) {
                    value = parseFloat(faceArrowInnerOffsetSlider.value);
                }
                value = Math.max(0, Math.min(2, value));
                faceArrowInnerOffsetSlider.value = value;
                e.target.value = value.toFixed(1);
                this.setFaceArrowInnerOffset(value);
            });
            
            // 初期値を設定
            if (this.trimBoxManipulator) {
                this.setFaceArrowInnerOffset(1.1);
            }
        }

        // 平行移動の矢印の位置調整UIのイベントリスナー
        const setupAxisHandlePositionListener = (axis, positionAxis, sliderId, inputId) => {
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            if (slider && input) {
                // スライダー変更時
                slider.addEventListener('input', (e) => {
                    const value = parseFloat(e.target.value);
                    input.value = value.toFixed(2);
                    if (this.trimBoxManipulator) {
                        this.trimBoxManipulator.setAxisHandlePosition(axis, positionAxis, value);
                    }
                });
                
                // 数値入力変更時
                input.addEventListener('input', (e) => {
                    let value = parseFloat(e.target.value);
                    if (isNaN(value)) return;
                    // 範囲制限
                    value = Math.max(-2, Math.min(2, value));
                    slider.value = value;
                    e.target.value = value.toFixed(2);
                    if (this.trimBoxManipulator) {
                        this.trimBoxManipulator.setAxisHandlePosition(axis, positionAxis, value);
                    }
                });
                
                // 数値入力フォーカスアウト時（確定）
                input.addEventListener('blur', (e) => {
                    let value = parseFloat(e.target.value);
                    if (isNaN(value)) {
                        value = parseFloat(slider.value);
                    }
                    value = Math.max(-2, Math.min(2, value));
                    slider.value = value;
                    e.target.value = value.toFixed(2);
                    if (this.trimBoxManipulator) {
                        this.trimBoxManipulator.setAxisHandlePosition(axis, positionAxis, value);
                    }
                });
            }
        };

        // X軸矢印の位置
        setupAxisHandlePositionListener('x', 'x', 'axisHandlePositionX_X', 'axisHandlePositionX_X_Input');
        setupAxisHandlePositionListener('x', 'y', 'axisHandlePositionX_Y', 'axisHandlePositionX_Y_Input');
        setupAxisHandlePositionListener('x', 'z', 'axisHandlePositionX_Z', 'axisHandlePositionX_Z_Input');

        // Y軸矢印の位置
        setupAxisHandlePositionListener('y', 'x', 'axisHandlePositionY_X', 'axisHandlePositionY_X_Input');
        setupAxisHandlePositionListener('y', 'y', 'axisHandlePositionY_Y', 'axisHandlePositionY_Y_Input');
        setupAxisHandlePositionListener('y', 'z', 'axisHandlePositionY_Z', 'axisHandlePositionY_Z_Input');

        // Z軸矢印の位置
        setupAxisHandlePositionListener('z', 'x', 'axisHandlePositionZ_X', 'axisHandlePositionZ_X_Input');
        setupAxisHandlePositionListener('z', 'y', 'axisHandlePositionZ_Y', 'axisHandlePositionZ_Y_Input');
        setupAxisHandlePositionListener('z', 'z', 'axisHandlePositionZ_Z', 'axisHandlePositionZ_Z_Input');

        // 平行移動の矢印の追従ハンドル選択
        const axisHandleFollowHandleSelect = document.getElementById('axisHandleFollowHandleSelect');
        if (axisHandleFollowHandleSelect) {
            axisHandleFollowHandleSelect.addEventListener('change', (e) => {
                const value = e.target.value;
                const [type, index] = value.split(':');
                if (this.trimBoxManipulator) {
                    this.trimBoxManipulator.setFollowHandle(type, type === 'edge' ? parseInt(index) : index);
                }
            });
        }

        if (completeSliceBtn) {
            completeSliceBtn.addEventListener('click', () => this.executeTrim());
        }
        if (cancelSliceBtn) {
            cancelSliceBtn.addEventListener('click', () => {
                this.toggleTrimBox(); // スライスを中止
            });
        }
        if (fullRangeSliceBtn) {
            fullRangeSliceBtn.addEventListener('click', () => this.fullRangeSlice());
        }

        // 全範囲スライスモーダルのイベントリスナー
        const fullRangeSliceModal = document.getElementById('fullRangeSliceModal');
        const fullRangeSliceModalCloseBtn = document.getElementById('fullRangeSliceModalCloseBtn');
        const fullRangeSliceModalCancelBtn = document.getElementById('fullRangeSliceModalCancelBtn');
        const fullRangeSliceModalConfirmBtn = document.getElementById('fullRangeSliceModalConfirmBtn');
        
        if (fullRangeSliceModalCloseBtn) {
            fullRangeSliceModalCloseBtn.addEventListener('click', () => {
                this.hideFullRangeSliceModal();
            });
        }
        if (fullRangeSliceModalCancelBtn) {
            fullRangeSliceModalCancelBtn.addEventListener('click', () => {
                this.hideFullRangeSliceModal();
            });
        }
        if (fullRangeSliceModalConfirmBtn) {
            fullRangeSliceModalConfirmBtn.addEventListener('click', () => {
                console.log('全範囲を表示するボタンがクリックされました');
                this.executeFullRangeSlice();
            });
        } else {
            console.warn('fullRangeSliceModalConfirmBtn要素が見つかりません');
        }
        // オーバーレイをクリックしてもモーダルを閉じる
        if (fullRangeSliceModal) {
            const overlay = document.getElementById('fullRangeSliceModalOverlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    this.hideFullRangeSliceModal();
                });
            }
        }

        // オプションパネルの開閉機能
        const optionPanelHeader = document.getElementById('optionPanelHeader');
        if (optionPanelHeader && optionPanel) {
            optionPanelHeader.addEventListener('click', () => {
                this.toggleOptionPanel();
            });
        }

        // スライス完了時のUIのイベントリスナー
        const editSliceBtn = document.getElementById('editSliceBtn');
        const closeSliceViewBtn = document.getElementById('closeSliceViewBtn');
        if (editSliceBtn) {
            editSliceBtn.addEventListener('click', () => {
                // モデル全体を表示する初期状態に戻す
                this.resetModel();
                // スライス完了時のUIを非表示にして、編集モードに戻す
                const sliceViewMode = document.getElementById('sliceViewMode');
                if (sliceViewMode) {
                    sliceViewMode.style.display = 'none';
                }
                // スライスモードを再度有効化
                this.toggleTrimBox();
            });
        }
        if (closeSliceViewBtn) {
            closeSliceViewBtn.addEventListener('click', () => {
                // モーダルを表示
                this.showRemoveSliceModal();
            });
        }

        // スライス解除確認モーダルのイベントリスナー
        const removeSliceModal = document.getElementById('removeSliceModal');
        const removeSliceModalCloseBtn = document.getElementById('removeSliceModalCloseBtn');
        const removeSliceModalCancelBtn = document.getElementById('removeSliceModalCancelBtn');
        const removeSliceModalConfirmBtn = document.getElementById('removeSliceModalConfirmBtn');
        
        if (removeSliceModalCloseBtn) {
            removeSliceModalCloseBtn.addEventListener('click', () => {
                this.hideRemoveSliceModal();
            });
        }
        if (removeSliceModalCancelBtn) {
            removeSliceModalCancelBtn.addEventListener('click', () => {
                this.hideRemoveSliceModal();
            });
        }
        if (removeSliceModalConfirmBtn) {
            removeSliceModalConfirmBtn.addEventListener('click', () => {
                this.executeRemoveSlice();
            });
        }
        // オーバーレイをクリックしてもモーダルを閉じる
        if (removeSliceModal) {
            const overlay = document.getElementById('removeSliceModalOverlay');
            if (overlay) {
                overlay.addEventListener('click', () => {
                    this.hideRemoveSliceModal();
                });
            }
        }

        // モード切り替えのイベントリスナー
        const mode3D = document.getElementById('mode3D');
        const modeWalkThrough = document.getElementById('modeWalkThrough');
        if (mode3D) {
            mode3D.addEventListener('click', () => this.switchMode('3d'));
        }
        if (modeWalkThrough) {
            modeWalkThrough.addEventListener('click', () => this.switchMode('walkthrough'));
        }

        // ビューコントロールタブのイベントリスナー
        const orbitTab = document.getElementById('orbitTab');
        const lookTab = document.getElementById('lookTab');
        const thirdTab = document.getElementById('thirdTab');
        if (orbitTab) {
            orbitTab.addEventListener('click', () => this.switchViewMode('orbit'));
        }
        if (lookTab) {
            lookTab.addEventListener('click', () => this.switchViewMode('look'));
        }
        if (thirdTab) {
            thirdTab.addEventListener('click', () => this.switchViewMode('third'));
        }

        // 旧UI要素のイベントリスナー（後方互換性）
        if (toggleDisplayMode) {
            toggleDisplayMode.addEventListener('click', () => this.toggleDisplayMode());
        }
        if (toggleSkybox) {
            toggleSkybox.addEventListener('change', (e) => this.toggleSkybox(e.target.checked));
        }
        if (toggleTrimBox) {
            toggleTrimBox.addEventListener('click', () => this.toggleTrimBox());
        }
        if (toggleOutsideView) {
            toggleOutsideView.addEventListener('click', () => this.toggleOutsideView());
        }
        if (executeTrim) {
            executeTrim.addEventListener('click', () => this.executeTrim());
        }
        if (resetModel) {
            resetModel.addEventListener('click', () => this.resetModel());
        }
        if (resetCamera) {
            resetCamera.addEventListener('click', () => this.resetCameraPosition());
        }

        // 向き調整関連のイベントリスナー
        this.setupOrientationEventListeners();
        
        // 初期化時にビューコントロールアイコンの色を設定
        setTimeout(() => {
            // 初期状態のスライド背景位置を設定
            const viewControlTabs = document.getElementById('viewControlTabs');
            if (viewControlTabs) {
                viewControlTabs.setAttribute('data-active-index', '1'); // lookタブが初期状態
            }
            
            const modeSwitch = document.getElementById('modeSwitch');
            if (modeSwitch) {
                modeSwitch.setAttribute('data-active-index', '0'); // 3Dモードが初期状態
            }
            
            this.updateViewControlIconColors();
            this.updateModeSwitchIconColors();
            this.updateSliceButtonIconColor();
        }, 100);
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
            
            // 直接PLYファイルを読み込む（タブデータを使わない）
            await this.loadPLYFromArrayBuffer(arrayBuffer);
            
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
            
            // モデルの位置を設定（オフセットを適用）
            this.currentModel.position.copy(this.modelPositionOffset);
            
            this.scene.add(this.currentModel);
            this.originalModel = this.currentModel.clone();
            // originalModelにも位置を設定
            this.originalModel.position.copy(this.modelPositionOffset);
            this.realtimePreview.setOriginalModel(this.currentModel);
            
            // グリッドを更新
            this.updateGrid();
            
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
        
        // グリッドを削除
        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            this.gridMesh.geometry.dispose();
            this.gridMesh.material.dispose();
            this.gridMesh = null;
        }

        // 境界表示モデルをクリア
        if (this.boundaryDisplayModel) {
            this.scene.remove(this.boundaryDisplayModel);
            this.boundaryDisplayModel.geometry.dispose();
            this.boundaryDisplayModel.material.dispose();
            this.boundaryDisplayModel = null;
        }

        this.trimBoxManipulator.clear();
        this.realtimePreview.clearPreview(this.scene);
        this.trimBoxVisible = false;
    }

    // PLYファイル読み込みメソッド（タブデータを使わない簡素版）
    async loadPLYFromArrayBuffer(arrayBuffer) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        const dropZone = document.getElementById('dropZone');
        
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (dropZone) dropZone.classList.add('hidden');

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
                vertices: geometry.attributes.position.count,
                hasColors: !!geometry.attributes.color
            });

            // 直接モデルを作成
            this.originalGeometry = geometry.clone();
            this.createModel(geometry.clone());
            
            if (this.currentModel) {
                this.fitCameraToModel();
                this.updateUI();
                this.enableControls();
                console.log('モデル作成完了');
            } else {
                throw new Error('モデルの作成に失敗しました');
            }
            
        } catch (error) {
            console.error('PLYファイルの読み込みエラー:', error);
            alert('PLYファイルの読み込みに失敗しました: ' + error.message);
            // エラー時は現在のモデルをクリアして安全な状態に戻す
            this.clearModel();
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    switchToTabData(tab) {
        if (!tab) {
            console.warn('switchToTabData: tabがnullです');
            return;
        }

        console.log('switchToTabData: タブID', tab.id, 'タブ名', tab.name);
        
        const tabData = this.tabData.get(tab.id);
        if (!tabData) {
            console.warn('タブデータが見つかりません:', tab.id, '利用可能なタブデータ:', Array.from(this.tabData.keys()));
            return;
        }

        if (!tabData.currentGeometry || !tabData.currentGeometry.attributes) {
            console.error('switchToTabData: 無効なジオメトリデータ');
            return;
        }
        
        console.log('switchToTabData: ジオメトリデータ確認完了', {
            vertices: tabData.currentGeometry.attributes.position.count,
            hasColors: !!tabData.currentGeometry.attributes.color
        });

        // 現在のモデルをクリア
        this.clearModel();

        // タブのデータから復元
        this.originalGeometry = tabData.originalGeometry.clone();
        this.modelRotation.copy(tabData.modelRotation);
        this.originalModelRotation.copy(tabData.originalModelRotation);
        
        console.log('switchToTabData: モデルを作成中...');
        this.createModel(tabData.currentGeometry.clone());
        
        // createModelが失敗した場合は処理を中断
        if (!this.currentModel) {
            console.error('switchToTabData: モデルの作成に失敗しました');
            return;
        }
        
        console.log('switchToTabData: モデル作成成功', {
            type: this.currentModel.constructor.name,
            vertices: this.currentModel.geometry.attributes.position.count
        });
        
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

    updateGrid() {
        if (!this.currentModel) {
            // モデルがない場合はグリッドを削除
            if (this.gridMesh) {
                this.scene.remove(this.gridMesh);
                this.gridMesh.geometry.dispose();
                this.gridMesh.material.dispose();
                this.gridMesh = null;
            }
            return;
        }

        // 既存のグリッドを削除
        if (this.gridMesh) {
            this.scene.remove(this.gridMesh);
            this.gridMesh.geometry.dispose();
            this.gridMesh.material.dispose();
            this.gridMesh = null;
        }

        // モデルのバウンディングボックスを取得
        this.currentModel.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(this.currentModel);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const min = box.min;
        
        // モデルの実際の頂点座標から最小Yを直接取得（より正確）
        const modelGeometry = this.currentModel.geometry;
        const positions = modelGeometry.attributes.position.array;
        let actualMinY = Infinity;
        let actualMaxY = -Infinity;
        
        // すべての頂点をワールド座標に変換して最小Yを取得
        let processedCount = 0;
        for (let i = 0; i < positions.length; i += 3) {
            const localPoint = new THREE.Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            );
            
            // ワールド座標に変換（モデルの回転と位置を考慮）
            const worldPoint = localPoint.clone();
            worldPoint.applyMatrix4(this.currentModel.matrixWorld);
            
            if (worldPoint.y < actualMinY) actualMinY = worldPoint.y;
            if (worldPoint.y > actualMaxY) actualMaxY = worldPoint.y;
            processedCount++;
        }
        
        // actualMinYがInfinityのままの場合、バウンディングボックスのmin.yを使用
        if (actualMinY === Infinity) {
            console.warn('actualMinYがInfinityのため、バウンディングボックスのmin.yを使用します');
            actualMinY = min.y;
        }
        
        // グリッドのサイズ（モデルの最大寸法の1.5倍程度に縮小）
        const maxDim = Math.max(size.x, size.y, size.z);
        const gridSize = maxDim * 8;
        const gridSpacing = maxDim * 0.2; // グリッドの間隔を細かく

        // グリッドのY座標（モデルのすぐ下）
        // 実際の最小Y座標を使用（より正確）
        // わずかに下にオフセット（0.01倍）してモデルと重ならないように
        const gridY = actualMinY - maxDim * 0.01;
        
        // デバッグ情報
        console.log('グリッド位置計算:', {
            processedVertices: processedCount,
            boundingBoxMinY: min.y,
            actualMinY: actualMinY,
            actualMaxY: actualMaxY,
            gridY: gridY,
            offset: actualMinY - gridY,
            maxDim: maxDim,
            size: size,
            center: center,
            modelPosition: this.currentModel.position,
            modelRotation: this.currentModel.rotation
        });
        
        // 遠近感を持たせるためのグリッド作成
        const vertices = [];
        const colors = [];
        const gridColor = new THREE.Color(0x030303); // シアン色
        const gridAlpha = 0.3; // 透明度
        
        // グリッドの分割数
        const divisions = Math.floor(gridSize / gridSpacing);
        
        // シンプルな均一なグリッドを作成
        for (let i = -divisions; i <= divisions; i++) {
            for (let j = -divisions; j <= divisions; j++) {
                // グリッド点の位置（等間隔）
                const x = center.x + i * gridSpacing;
                const z = center.z + j * gridSpacing;
                
                // 対角線を引く（三角形のグリッド）
                if (i < divisions && j < divisions) {
                    // 右下から左上への対角線
                    vertices.push(
                        x, gridY, z,
                        center.x + (i + 1) * gridSpacing, gridY, center.z + (j + 1) * gridSpacing
                    );
                    colors.push(
                        gridColor.r, gridColor.g, gridColor.b,
                        gridColor.r, gridColor.g, gridColor.b
                    );
                }
                
                // 水平線（X方向）
                if (i < divisions) {
                    vertices.push(
                        x, gridY, z,
                        center.x + (i + 1) * gridSpacing, gridY, z
                    );
                    colors.push(
                        gridColor.r, gridColor.g, gridColor.b,
                        gridColor.r, gridColor.g, gridColor.b
                    );
                }
                
                // 垂直線（Z方向）
                if (j < divisions) {
                    vertices.push(
                        x, gridY, z,
                        x, gridY, center.z + (j + 1) * gridSpacing
                    );
                    colors.push(
                        gridColor.r, gridColor.g, gridColor.b,
                        gridColor.r, gridColor.g, gridColor.b
                    );
                }
            }
        }
        
        // ジオメトリを作成
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        
        // マテリアルを作成（線の太さを細く）
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: gridAlpha,
            linewidth: 1
        });
        
        // グリッドメッシュを作成
        this.gridMesh = new THREE.LineSegments(geometry, material);
        this.gridMesh.renderOrder = 100; // モデルの前に描画（表示されるように）
        this.gridMesh.position.set(0, 0, 0); // 位置を明示的に設定
        
        // シーンに追加
        this.scene.add(this.gridMesh);
        
        // グリッドの実際の位置を確認
        const gridBounds = new THREE.Box3().setFromObject(this.gridMesh);
        const gridCenterPos = gridBounds.getCenter(new THREE.Vector3());
        const gridMinPos = gridBounds.min;
        
        console.log('グリッド作成完了:', {
            gridSize: gridSize,
            gridSpacing: gridSpacing,
            calculatedGridY: gridY,
            actualGridMinY: gridMinPos.y,
            actualGridCenterY: gridCenterPos.y,
            gridMeshPosition: this.gridMesh.position,
            vertices: vertices.length / 3,
            firstVertexY: vertices[1], // 最初の頂点のY座標
            secondVertexY: vertices[4] // 2番目の頂点のY座標
        });
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
        
        // モデルの位置を設定（オフセットを適用）
        this.currentModel.position.copy(this.modelPositionOffset);
        
        this.scene.add(this.currentModel);
        this.realtimePreview.setOriginalModel(this.currentModel);
        
        const toggleButton = document.getElementById('toggleDisplayMode');
        toggleButton.textContent = this.isPointMode ? 'ポイント表示' : 'サーフェス表示';
        
        if (this.trimBoxVisible) {
            this.updatePreview();
        }
    }

    toggleTrimBox() {
        console.log('toggleTrimBox呼び出し:', {
            currentModel: !!this.currentModel,
            trimBoxVisible: this.trimBoxVisible
        });
        
        if (!this.currentModel) {
            console.warn('toggleTrimBox: currentModelが存在しません');
            alert('モデルが読み込まれていません。PLYファイルを読み込んでください。');
            return;
        }
        
        this.trimBoxVisible = !this.trimBoxVisible;

        // スライスモード時の天球と背景色の制御
        if (this.trimBoxVisible) {
            // スライスモードON: 天球を常に表示（OFF: グレー、ON: 天球画像）
            // スライスモード用の天球トグルを初期状態（OFF）に設定
            const toggleSkyboxSlice = document.getElementById('toggleSkyboxSlice');
            if (toggleSkyboxSlice) {
                toggleSkyboxSlice.checked = false;
                // 天球の表示方法を更新（OFF: グレー）
                this.toggleSkyboxInSliceMode(false);
            }
        } else {
            // スライスモードOFF: 天球の表示状態を元に戻す
            if (this.skyboxSphere && this.skyboxSphere.material) {
                // 天球のテクスチャを復元
                if (this.skyboxTexture) {
                    this.skyboxSphere.material.map = this.skyboxTexture;
                    this.skyboxSphere.material.color.setHex(0xffffff); // 色を白に戻す
                    this.skyboxSphere.material.needsUpdate = true;
                }
                this.skyboxSphere.visible = this.skyboxVisible;
            }
            if (this.skyboxVisible) {
                this.scene.background = null; // 天球表示時は背景色を無効
            } else {
                this.scene.background = this.defaultBackgroundColor; // デフォルト背景色
            }
        }

        // 白枠の表示/非表示
        const operationFrame = document.getElementById('operationFrame');
        if (operationFrame) {
            if (this.trimBoxVisible) {
                operationFrame.classList.add('active');
            } else {
                operationFrame.classList.remove('active');
            }
        }
        
        // スライス中ステータスの表示/非表示
        const slicingStatus = document.getElementById('slicingStatus');
        if (slicingStatus) {
            slicingStatus.style.display = this.trimBoxVisible ? 'flex' : 'none';
        }
        
        // オプションパネルの表示/非表示
        const optionPanel = document.getElementById('optionPanel');
        if (optionPanel) {
            if (this.trimBoxVisible) {
                // スライスモードに入ったときは開いた状態にする
                optionPanel.style.display = 'block'; // 表示を復元
                optionPanel.classList.add('active');
                optionPanel.classList.remove('closed');
                
                // 矢印タイプセレクトボックスの値を現在の設定に合わせる
                const arrowTypeSelect = document.getElementById('arrowTypeSelect');
                if (arrowTypeSelect && this.trimBoxManipulator) {
                    const currentType = this.trimBoxManipulator.arrowType || 'arrow';
                    arrowTypeSelect.value = currentType;
                    
                    // arrow_cornクリック可能領域サイズ調整パネルの表示/非表示を切り替え
                    const clickablePanel = document.getElementById('arrowCornClickablePanel');
                    if (clickablePanel) {
                        clickablePanel.style.display = currentType === 'arrow_corn' ? 'flex' : 'none';
                    }
                    
                    // arrow_corn専用の面の矢印の位置調整パネルの表示/非表示を切り替え
                    const faceArrowInnerOffsetPanel = document.getElementById('faceArrowInnerOffsetPanel');
                    if (faceArrowInnerOffsetPanel) {
                        faceArrowInnerOffsetPanel.style.display = currentType === 'arrow_corn' ? 'flex' : 'none';
                    }
                    
                    // 平行移動の矢印の追従ハンドル選択パネルの表示/非表示を切り替え
                    const axisHandleFollowHandlePanel = document.getElementById('axisHandleFollowHandlePanel');
                    if (axisHandleFollowHandlePanel) {
                        axisHandleFollowHandlePanel.style.display = currentType === 'arrow_corn' ? 'flex' : 'none';
                    }
                    
                    if (currentType === 'arrow_corn') {
                        // arrow_cornの場合、現在の表示状態をUIに反映
                        if (currentType === 'arrow_corn') {
                            const toggle = document.getElementById('toggleArrowCornClickable');
                            if (toggle && this.trimBoxManipulator.arrowCornClickableVisible !== undefined) {
                                toggle.checked = this.trimBoxManipulator.arrowCornClickableVisible;
                            }
                        }
                    }
                }
            } else {
                // スライスモードを抜ける時は完全に非表示
                optionPanel.classList.remove('active');
                optionPanel.classList.remove('closed');
                optionPanel.style.display = 'none';
            }
        }
        
        // スライスボタンの状態更新
        const sliceButton = document.getElementById('sliceButton');
        if (sliceButton) {
            if (this.trimBoxVisible) {
                sliceButton.classList.add('active');
            } else {
                sliceButton.classList.remove('active');
            }
            // アイコンの色を更新
            this.updateSliceButtonIconColor();
        }
        
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
            if (toggleOutsideButton) {
                toggleOutsideButton.textContent = '箱外モデル表示';
            }
            const toggleOutsideViewNew = document.getElementById('toggleOutsideViewNew');
            if (toggleOutsideViewNew) {
                toggleOutsideViewNew.checked = true;
            }
        }
        
        // 旧UI要素の更新（後方互換性）
        const toggleButton = document.getElementById('toggleTrimBox');
        if (toggleButton) {
            toggleButton.textContent = this.trimBoxVisible ? 'スライスを中止する' : 'スライス';
        }
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
        
        // トリミング箱の情報を保存（境界表示用）
        const savedTrimBoxInfo = {
            position: this.trimBoxManipulator.trimBox.position.clone(),
            rotation: this.trimBoxManipulator.trimBox.rotation.clone(),
            size: new THREE.Vector3(
                this.trimBoxManipulator.trimBox.geometry.parameters.width / 2,
                this.trimBoxManipulator.trimBox.geometry.parameters.height / 2,
                this.trimBoxManipulator.trimBox.geometry.parameters.depth / 2
            )
        };

        this.createModel(newGeometry);

        // 向きを復元
        this.currentModel.rotation.copy(currentRotation);
        this.modelRotation.copy(currentRotation);

        // 新しいモデルをrealtimePreviewに設定
        this.realtimePreview.setOriginalModel(this.currentModel);

        // トリミング箱をクリアする前にプレビューを更新
        this.realtimePreview.clearPreview(this.scene);

        this.trimBoxManipulator.clear();
        this.trimBoxVisible = false;

        // 境界点群を白く表示（スライス中の断面表示を継続）
        this.createBoundaryDisplay(savedTrimBoxInfo, currentRotation);


        // 新しいUI要素の状態を更新
        const operationFrame = document.getElementById('operationFrame');
        if (operationFrame) {
            operationFrame.classList.remove('active');
        }
        const slicingStatus = document.getElementById('slicingStatus');
        if (slicingStatus) {
            slicingStatus.style.display = 'none';
        }
        const optionPanel = document.getElementById('optionPanel');
        if (optionPanel) {
            optionPanel.classList.remove('active');
            optionPanel.classList.remove('closed');
            optionPanel.style.display = 'none'; // スライス実行後は完全に非表示
        }
        const sliceButton = document.getElementById('sliceButton');
        if (sliceButton) {
            sliceButton.classList.remove('active');
            // アイコンの色を更新
            this.updateSliceButtonIconColor();
        }
        
        // スライス完了時のUIを表示
        const sliceViewMode = document.getElementById('sliceViewMode');
        if (sliceViewMode) {
            sliceViewMode.style.display = 'flex';
        }
        
        // 旧UI要素の更新（後方互換性）
        const toggleButton = document.getElementById('toggleTrimBox');
        if (toggleButton) {
            toggleButton.textContent = 'スライス';
        }
        
        this.updateUI();
        
        console.log('トリミング完了 - 向きを保持:', {
            rotation: currentRotation,
            trimmedVertices: vertexCount,
            originalVertices: positions.length / 3
        });
    }

    createBoundaryDisplay(trimBoxInfo, modelRotation) {
        if (!this.currentModel) return;

        // 既存の境界モデルがあればクリア
        if (this.boundaryDisplayModel) {
            this.scene.remove(this.boundaryDisplayModel);
            this.boundaryDisplayModel.geometry.dispose();
            this.boundaryDisplayModel.material.dispose();
            this.boundaryDisplayModel = null;
        }

        const geometry = this.currentModel.geometry;
        const positions = geometry.attributes.position.array;
        const boundaryPositions = [];
        const boundaryThreshold = 0.05; // 境界検出の閾値

        // トリミング箱の逆変換行列を計算
        const trimBoxMatrix = new THREE.Matrix4();
        trimBoxMatrix.makeRotationFromEuler(trimBoxInfo.rotation);
        trimBoxMatrix.setPosition(trimBoxInfo.position);
        const trimBoxInverseMatrix = trimBoxMatrix.clone().invert();

        // 各頂点が境界に近いかチェック
        for (let i = 0; i < positions.length; i += 3) {
            const localPoint = new THREE.Vector3(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            );

            // ワールド座標に変換（モデルの回転を適用）
            const worldPoint = localPoint.clone();
            worldPoint.applyEuler(modelRotation);

            // トリミング箱のローカル座標系に変換
            const trimBoxLocalPoint = worldPoint.clone();
            trimBoxLocalPoint.applyMatrix4(trimBoxInverseMatrix);

            // 各面からの距離を計算
            const distanceToXFace = Math.abs(Math.abs(trimBoxLocalPoint.x) - trimBoxInfo.size.x);
            const distanceToYFace = Math.abs(Math.abs(trimBoxLocalPoint.y) - trimBoxInfo.size.y);
            const distanceToZFace = Math.abs(Math.abs(trimBoxLocalPoint.z) - trimBoxInfo.size.z);

            // どれか一つの面に近い場合は境界点群
            const minDistance = Math.min(distanceToXFace, distanceToYFace, distanceToZFace);
            if (minDistance <= boundaryThreshold) {
                boundaryPositions.push(positions[i], positions[i + 1], positions[i + 2]);
            }
        }

        if (boundaryPositions.length === 0) return;

        // 境界点群を白く表示
        const boundaryGeometry = new THREE.BufferGeometry();
        boundaryGeometry.setAttribute('position', new THREE.Float32BufferAttribute(boundaryPositions, 3));

        const boundaryMaterial = new THREE.PointsMaterial({
            size: 0.040, // 少し大きめに表示
            color: 0xffffff,
            depthTest: true
        });

        this.boundaryDisplayModel = new THREE.Points(boundaryGeometry, boundaryMaterial);
        this.boundaryDisplayModel.rotation.copy(modelRotation);
        this.scene.add(this.boundaryDisplayModel);

        console.log('境界点群を表示:', {
            boundaryPoints: boundaryPositions.length / 3
        });
    }

    fullRangeSlice() {
        if (!this.currentModel) {
            console.warn('fullRangeSlice: currentModelが存在しません');
            alert('モデルが読み込まれていません。PLYファイルを読み込んでください。');
            return;
        }
        
        // モーダルを表示
        this.showFullRangeSliceModal();
    }

    showFullRangeSliceModal() {
        const modal = document.getElementById('fullRangeSliceModal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('全範囲スライスモーダルを表示しました');
        } else {
            console.error('fullRangeSliceModal要素が見つかりません');
        }
    }

    hideFullRangeSliceModal() {
        const modal = document.getElementById('fullRangeSliceModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    showRemoveSliceModal() {
        const modal = document.getElementById('removeSliceModal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    hideRemoveSliceModal() {
        const modal = document.getElementById('removeSliceModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    executeRemoveSlice() {
        // モーダルを非表示
        this.hideRemoveSliceModal();
        
        // モデル全体を表示する初期状態に戻す
        this.resetModel();
        
        // 天球のテクスチャを復元して天球画像を表示
        if (this.skyboxSphere && this.skyboxSphere.material) {
            // 天球のテクスチャを復元
            if (this.skyboxTexture) {
                this.skyboxSphere.material.map = this.skyboxTexture;
                this.skyboxSphere.material.color.setHex(0xffffff); // 色を白に戻す
                this.skyboxSphere.material.needsUpdate = true;
            }
            this.skyboxSphere.visible = true;
            this.skyboxVisible = true;
        }
        if (this.skyboxVisible) {
            this.scene.background = null; // 天球表示時は背景色を無効
        }
        
        // 天球のチェックボックスの状態を更新
        const toggleCheckbox = document.getElementById('toggleSkybox');
        if (toggleCheckbox) {
            toggleCheckbox.checked = this.skyboxVisible;
        }
        
        // スライス完了時のUIを非表示
        const sliceViewMode = document.getElementById('sliceViewMode');
        if (sliceViewMode) {
            sliceViewMode.style.display = 'none';
        }
    }

    executeFullRangeSlice() {
        console.log('executeFullRangeSlice開始');
        if (!this.currentModel) {
            console.warn('executeFullRangeSlice: currentModelが存在しません');
            return;
        }
        
        // モーダルを非表示
        this.hideFullRangeSliceModal();
        
        // スライスモードでない場合はスライスモードを開始
        if (!this.trimBoxVisible) {
            console.log('スライスモードを開始します');
            this.toggleTrimBox();
        }
        
        // モデル全体を囲むバウンディングボックスを取得
        // originalGeometryが存在する場合は、それを使ってモデル全体のバウンディングボックスを取得
        let boundingBox;
        if (this.originalGeometry) {
            // 元のジオメトリからバウンディングボックスを計算
            this.originalGeometry.computeBoundingBox();
            boundingBox = this.originalGeometry.boundingBox.clone();
            
            // モデルの回転を考慮してバウンディングボックスを変換
            if (this.currentModel && this.currentModel.rotation) {
                const center = boundingBox.getCenter(new THREE.Vector3());
                const size = boundingBox.getSize(new THREE.Vector3());
                
                // 回転を適用した後のバウンディングボックスを計算
                const corners = [
                    new THREE.Vector3(center.x - size.x/2, center.y - size.y/2, center.z - size.z/2),
                    new THREE.Vector3(center.x + size.x/2, center.y - size.y/2, center.z - size.z/2),
                    new THREE.Vector3(center.x - size.x/2, center.y + size.y/2, center.z - size.z/2),
                    new THREE.Vector3(center.x + size.x/2, center.y + size.y/2, center.z - size.z/2),
                    new THREE.Vector3(center.x - size.x/2, center.y - size.y/2, center.z + size.z/2),
                    new THREE.Vector3(center.x + size.x/2, center.y - size.y/2, center.z + size.z/2),
                    new THREE.Vector3(center.x - size.x/2, center.y + size.y/2, center.z + size.z/2),
                    new THREE.Vector3(center.x + size.x/2, center.y + size.y/2, center.z + size.z/2)
                ];
                
                // 各コーナーに回転を適用
                corners.forEach(corner => {
                    corner.applyEuler(this.currentModel.rotation);
                });
                
                // 回転後のバウンディングボックスを再計算
                boundingBox = new THREE.Box3().setFromPoints(corners);
            }
        } else {
            // originalGeometryがない場合は、現在のモデルから取得
            this.currentModel.updateMatrixWorld();
            boundingBox = new THREE.Box3().setFromObject(this.currentModel);
        }
        
        // 既存のトリミングボックスをクリア
        this.trimBoxManipulator.clear();
        
        // カメラ位置を初期位置に戻す
        if (this.initialCameraPosition && this.initialCameraTarget) {
            this.camera.position.copy(this.initialCameraPosition);
            this.controls.target.copy(this.initialCameraTarget);
            this.controls.update();
        }
        
        // モデル全体を囲む箱を作成（バウンディングボックスを使用するフラグを渡す）
        this.trimBoxManipulator.create(boundingBox, true); // 第2引数で全体を囲むフラグを渡す
        
        // 箱が正しく作成されたか確認
        if (this.trimBoxManipulator.trimBox) {
            console.log('箱が作成されました:', {
                position: this.trimBoxManipulator.trimBox.position,
                size: {
                    width: this.trimBoxManipulator.trimBox.geometry.parameters.width,
                    height: this.trimBoxManipulator.trimBox.geometry.parameters.height,
                    depth: this.trimBoxManipulator.trimBox.geometry.parameters.depth
                },
                visible: this.trimBoxManipulator.trimBox.visible
            });
        } else {
            console.error('箱が作成されませんでした');
        }
        
        this.updatePreview();
        
        console.log('全範囲スライス: モデル全体を囲む箱を作成しました', {
            boundingBox: boundingBox,
            size: boundingBox.getSize(new THREE.Vector3())
        });
    }

    toggleOptionPanel() {
        const optionPanel = document.getElementById('optionPanel');
        if (!optionPanel) return;
        
        // スライスモードでない場合は何もしない
        if (!this.trimBoxVisible) return;
        
        // 開閉状態を切り替え
        if (optionPanel.classList.contains('active')) {
            // 開いている場合は閉じる
            optionPanel.classList.remove('active');
            optionPanel.classList.add('closed');
        } else {
            // 閉じている場合は開く
            optionPanel.classList.remove('closed');
            optionPanel.classList.add('active');
        }
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

        // 境界表示モデルをクリア
        if (this.boundaryDisplayModel) {
            this.scene.remove(this.boundaryDisplayModel);
            this.boundaryDisplayModel.geometry.dispose();
            this.boundaryDisplayModel.material.dispose();
            this.boundaryDisplayModel = null;
        }

        // 天球と背景色を元に戻す（テクスチャも復元）
        if (this.skyboxSphere && this.skyboxSphere.material) {
            // 天球のテクスチャを復元
            if (this.skyboxTexture) {
                this.skyboxSphere.material.map = this.skyboxTexture;
                this.skyboxSphere.material.color.setHex(0xffffff); // 色を白に戻す
                this.skyboxSphere.material.needsUpdate = true;
            }
            this.skyboxSphere.visible = this.skyboxVisible;
        }
        if (this.skyboxVisible) {
            this.scene.background = null; // 天球表示時は背景色を無効
        } else {
            this.scene.background = this.defaultBackgroundColor; // デフォルト背景色
        }

        // 新しいUI要素の状態をリセット
        const operationFrame = document.getElementById('operationFrame');
        if (operationFrame) {
            operationFrame.classList.remove('active');
        }
        const slicingStatus = document.getElementById('slicingStatus');
        if (slicingStatus) {
            slicingStatus.style.display = 'none';
        }
        const optionPanel = document.getElementById('optionPanel');
        if (optionPanel) {
            optionPanel.classList.remove('active');
            optionPanel.classList.remove('closed');
            // display: noneは設定しない（編集ボタンから呼ばれた時に再表示されるため）
        }
        const sliceButton = document.getElementById('sliceButton');
        if (sliceButton) {
            sliceButton.classList.remove('active');
            // アイコンの色を更新
            this.updateSliceButtonIconColor();
        }
        
        // 旧UI要素の更新（後方互換性）
        const toggleButton = document.getElementById('toggleTrimBox');
        if (toggleButton) {
            toggleButton.textContent = 'スライス';
        }
        
        this.updateUI();
    }

    updateUI() {
        const originalCount = this.originalGeometry ? 
            this.originalGeometry.attributes.position.count : 0;
        const currentCount = this.currentModel ? 
            this.currentModel.geometry.attributes.position.count : 0;
        
        const originalVertexCountEl = document.getElementById('originalVertexCount');
        if (originalVertexCountEl) {
            originalVertexCountEl.textContent = originalCount.toLocaleString();
        }
        
        const currentVertexCountEl = document.getElementById('currentVertexCount');
        if (currentVertexCountEl) {
            currentVertexCountEl.textContent = currentCount.toLocaleString();
        }
    }

    updateTrimBoxInfo() {
        const trimBoxBounds = this.trimBoxManipulator.getBoundingBox();
        if (!trimBoxBounds) return;
        
        const min = trimBoxBounds.min;
        const max = trimBoxBounds.max;
        
        const trimBoxXEl = document.getElementById('trimBoxX');
        if (trimBoxXEl) {
            trimBoxXEl.textContent = `${min.x.toFixed(2)} - ${max.x.toFixed(2)}`;
        }
        
        const trimBoxYEl = document.getElementById('trimBoxY');
        if (trimBoxYEl) {
            trimBoxYEl.textContent = `${min.y.toFixed(2)} - ${max.y.toFixed(2)}`;
        }
        
        const trimBoxZEl = document.getElementById('trimBoxZ');
        if (trimBoxZEl) {
            trimBoxZEl.textContent = `${min.z.toFixed(2)} - ${max.z.toFixed(2)}`;
        }
        
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
            // 新しいUI要素の有効化
            const toggleTrimBoxNew = document.getElementById('toggleTrimBoxNew');
            if (toggleTrimBoxNew) {
                toggleTrimBoxNew.disabled = false;
            }
            const toggleOutsideViewNew = document.getElementById('toggleOutsideViewNew');
            if (toggleOutsideViewNew) {
                toggleOutsideViewNew.disabled = false;
            }
            const fullRangeSliceBtn = document.getElementById('fullRangeSliceBtn');
            if (fullRangeSliceBtn) {
                fullRangeSliceBtn.disabled = false;
            }
            
            // 旧UI要素の有効化（後方互換性）
            const toggleTrimBox = document.getElementById('toggleTrimBox');
            if (toggleTrimBox) {
                toggleTrimBox.disabled = false;
            }
            const toggleOutsideView = document.getElementById('toggleOutsideView');
            if (toggleOutsideView) {
                toggleOutsideView.disabled = false;
            }
            const executeTrim = document.getElementById('executeTrim');
            if (executeTrim) {
                executeTrim.disabled = false;
            }
            const resetModel = document.getElementById('resetModel');
            if (resetModel) {
                resetModel.disabled = false;
            }
            const resetCamera = document.getElementById('resetCamera');
            if (resetCamera) {
                resetCamera.disabled = false;
            }
        }
    }

    toggleOutsideView() {
        if (!this.trimBoxVisible) return;
        
        const isVisible = this.realtimePreview.toggleOutsideVisibility();
        
        // 新しいUI要素の更新
        const toggleOutsideViewNew = document.getElementById('toggleOutsideViewNew');
        if (toggleOutsideViewNew) {
            toggleOutsideViewNew.checked = isVisible;
        }
        
        // 旧UI要素の更新（後方互換性）
        const toggleButton = document.getElementById('toggleOutsideView');
        if (toggleButton) {
            toggleButton.textContent = isVisible ? '箱外モデル非表示' : '箱外モデル表示';
        }
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

    switchMode(mode) {
        if (mode === this.currentMode) return;
        
        this.currentMode = mode;
        
        // UIの状態を更新
        const mode3D = document.getElementById('mode3D');
        const modeWalkThrough = document.getElementById('modeWalkThrough');
        
        if (mode3D && modeWalkThrough) {
            const modeSwitch = document.getElementById('modeSwitch');
            
            let activeIndex = 0; // デフォルトは3D
            if (mode === '3d') {
                mode3D.classList.add('active');
                modeWalkThrough.classList.remove('active');
                activeIndex = 0;
            } else if (mode === 'walkthrough') {
                mode3D.classList.remove('active');
                modeWalkThrough.classList.add('active');
                activeIndex = 1;
            }
            
            // スライド背景の位置を更新
            if (modeSwitch) {
                modeSwitch.setAttribute('data-active-index', activeIndex.toString());
            }
            
            // アイコンの色を更新
            this.updateModeSwitchIconColors();
        }
        
        // モードに応じた処理を実装
        // 3Dモード: 通常のOrbitControls
        // ウォークスルーモード: FirstPersonControlsなどに変更（必要に応じて実装）
        console.log('モード切り替え:', mode);
        
        // 将来的にカメラコントロールを変更する場合はここで実装
        // 現時点ではUIの切り替えのみ
    }

    switchViewMode(viewMode) {
        if (viewMode === this.currentViewMode) return;
        
        this.currentViewMode = viewMode;
        
        // UIの状態を更新
        const orbitTab = document.getElementById('orbitTab');
        const lookTab = document.getElementById('lookTab');
        const thirdTab = document.getElementById('thirdTab');
        
        if (orbitTab && lookTab && thirdTab) {
            const viewControlTabs = document.getElementById('viewControlTabs');
            
            // すべてのタブからactiveクラスを削除
            orbitTab.classList.remove('active');
            lookTab.classList.remove('active');
            thirdTab.classList.remove('active');
            
            // 選択されたタブにactiveクラスを追加とインデックスを設定
            let activeIndex = 1; // デフォルトはlook
            if (viewMode === 'orbit') {
                orbitTab.classList.add('active');
                activeIndex = 0;
            } else if (viewMode === 'look') {
                lookTab.classList.add('active');
                activeIndex = 1;
            } else if (viewMode === 'third') {
                thirdTab.classList.add('active');
                activeIndex = 2;
            }
            
            // スライド背景の位置を更新
            if (viewControlTabs) {
                viewControlTabs.setAttribute('data-active-index', activeIndex.toString());
            }
            
            // アイコンの色を更新
            this.updateViewControlIconColors();
        }
        
        // ビューモードに応じた処理を実装
        // Orbit: 通常のOrbitControls
        // Look: カメラが常にモデルを見る
        // Third: サードパーソンビュー
        console.log('ビューモード切り替え:', viewMode);
        
        // 将来的にカメラコントロールを変更する場合はここで実装
        // 現時点ではUIの切り替えのみ
    }

    updateViewControlIconColors() {
        const inactiveColor = '#5A5D62';
        const activeColor = '#212224';
        
        const orbitTab = document.getElementById('orbitTab');
        const lookTab = document.getElementById('lookTab');
        const thirdTab = document.getElementById('thirdTab');
        
        const tabs = [
            { element: orbitTab, icon: 'assets/path.svg' },
            { element: lookTab, icon: 'assets/look.svg' },
            { element: thirdTab, icon: 'assets/fly.svg' }
        ];
        
        tabs.forEach(tab => {
            if (!tab.element) return;
            
            const img = tab.element.querySelector('img');
            if (!img) return;
            
            const isActive = tab.element.classList.contains('active');
            const targetColor = isActive ? activeColor : inactiveColor;
            
            // 元のSVGファイルのパスを取得（データURLの場合は元のパスを使用）
            let svgPath = img.src;
            if (svgPath.startsWith('blob:')) {
                // データURLの場合は元のパスを使用
                svgPath = tab.icon;
            } else if (!svgPath.includes('assets/')) {
                // パスが相対パスでない場合は元のパスを使用
                svgPath = tab.icon;
            }
            
            // SVGを読み込んでfill属性を変更
            fetch(svgPath)
                .then(response => response.text())
                .then(svgText => {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    const svgElement = svgDoc.querySelector('svg');
                    
                    if (svgElement) {
                        // すべてのpath要素のfill属性を変更
                        const paths = svgElement.querySelectorAll('path');
                        paths.forEach(path => {
                            path.setAttribute('fill', targetColor);
                        });
                        
                        // SVGをデータURLに変換
                        const serializer = new XMLSerializer();
                        const svgString = serializer.serializeToString(svgElement);
                        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                        const url = URL.createObjectURL(svgBlob);
                        
                        img.src = url;
                    }
                })
                .catch(error => {
                    console.warn('SVG色変更エラー:', error);
                });
        });
    }

    updateModeSwitchIconColors() {
        const inactiveColor = '#5A5D62';
        const activeColor = '#212224';
        
        const mode3D = document.getElementById('mode3D');
        const modeWalkThrough = document.getElementById('modeWalkThrough');
        
        const modes = [
            { element: mode3D, icon: 'assets/3dMode.svg' },
            { element: modeWalkThrough, icon: 'assets/2dMode.svg' }
        ];
        
        modes.forEach(mode => {
            if (!mode.element) return;
            
            const img = mode.element.querySelector('img');
            if (!img) return;
            
            const isActive = mode.element.classList.contains('active');
            const targetColor = isActive ? activeColor : inactiveColor;
            
            // 元のSVGファイルのパスを取得（データURLの場合は元のパスを使用）
            let svgPath = img.src;
            if (svgPath.startsWith('blob:')) {
                // データURLの場合は元のパスを使用
                svgPath = mode.icon;
            } else if (!svgPath.includes('assets/')) {
                // パスが相対パスでない場合は元のパスを使用
                svgPath = mode.icon;
            }
            
            // SVGを読み込んでfill属性を変更
            fetch(svgPath)
                .then(response => response.text())
                .then(svgText => {
                    const parser = new DOMParser();
                    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                    const svgElement = svgDoc.querySelector('svg');
                    
                    if (svgElement) {
                        // すべてのpath要素のfill属性を変更
                        const paths = svgElement.querySelectorAll('path');
                        paths.forEach(path => {
                            path.setAttribute('fill', targetColor);
                        });
                        
                        // SVGをデータURLに変換
                        const serializer = new XMLSerializer();
                        const svgString = serializer.serializeToString(svgElement);
                        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                        const url = URL.createObjectURL(svgBlob);
                        
                        img.src = url;
                    }
                })
                .catch(error => {
                    console.warn('SVG色変更エラー:', error);
                });
        });
    }

    updateSliceButtonIconColor() {
        const inactiveColor = '#DCDFE5';
        const activeColor = '#212224';
        
        const sliceButton = document.getElementById('sliceButton');
        if (!sliceButton) return;
        
        const toggleTrimBoxNew = document.getElementById('toggleTrimBoxNew');
        if (!toggleTrimBoxNew) return;
        
        const img = toggleTrimBoxNew.querySelector('img');
        if (!img) return;
        
        const isActive = sliceButton.classList.contains('active');
        const targetColor = isActive ? activeColor : inactiveColor;
        
        // 元のSVGファイルのパスを取得（データURLの場合は元のパスを使用）
        let svgPath = img.src;
        if (svgPath.startsWith('blob:')) {
            // データURLの場合は元のパスを使用
            svgPath = 'assets/sliceIcon.svg';
        } else if (!svgPath.includes('assets/')) {
            // パスが相対パスでない場合は元のパスを使用
            svgPath = 'assets/sliceIcon.svg';
        }
        
        // SVGを読み込んでfill属性を変更
        fetch(svgPath)
            .then(response => response.text())
            .then(svgText => {
                const parser = new DOMParser();
                const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
                const svgElement = svgDoc.querySelector('svg');
                
                if (svgElement) {
                    // すべてのpath要素のfill属性を変更
                    const paths = svgElement.querySelectorAll('path');
                    paths.forEach(path => {
                        path.setAttribute('fill', targetColor);
                    });
                    
                    // SVGをデータURLに変換
                    const serializer = new XMLSerializer();
                    const svgString = serializer.serializeToString(svgElement);
                    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
                    const url = URL.createObjectURL(svgBlob);
                    
                    img.src = url;
                }
            })
            .catch(error => {
                console.warn('スライスボタンSVG色変更エラー:', error);
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
        // テクスチャを保持
        this.skyboxTexture = texture;
        
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

    // スライスモード中の天球表示を切り替え（OFF: グレー、ON: 天球画像）
    toggleSkyboxInSliceMode(checked) {
        // スライスモード中でない場合は何もしない
        if (!this.trimBoxVisible) {
            console.warn('スライスモード中ではありません');
            return;
        }

        // 天球は常に表示（ON/OFFで表示方法を切り替え）
        if (this.skyboxSphere) {
            this.skyboxSphere.visible = true;
            
            // 天球のマテリアルを更新
            if (this.skyboxSphere.material) {
                if (checked) {
                    // ON: 天球画像を使用
                    if (this.skyboxTexture) {
                        this.skyboxSphere.material.map = this.skyboxTexture;
                        this.skyboxSphere.material.color.setHex(0xffffff); // 色を白に戻す
                    }
                } else {
                    // OFF: グレー色を使用
                    this.skyboxSphere.material.color.setHex(0x26282B); // グレー色
                    this.skyboxSphere.material.map = null; // テクスチャを無効化
                }
                this.skyboxSphere.material.needsUpdate = true;
            }
        }

        // 背景色も切り替え
        this.scene.background = null; // 天球表示時は背景色を無効

        // チェックボックスの状態を更新
        const toggleCheckbox = document.getElementById('toggleSkyboxSlice');
        if (toggleCheckbox) {
            toggleCheckbox.checked = checked;
        }

        console.log('スライスモード中の天球表示方法:', checked ? '天球画像' : 'グレー');
    }

    changeArrowType(type) {
        if (!this.trimBoxManipulator) {
            return;
        }
        
        this.trimBoxManipulator.setArrowType(type);
        
        // セレクトボックスの値を更新
        const arrowTypeSelect = document.getElementById('arrowTypeSelect');
        if (arrowTypeSelect) {
            arrowTypeSelect.value = type;
        }
        
        // arrow_cornクリック可能領域サイズ調整パネルの表示/非表示を切り替え
        const clickablePanel = document.getElementById('arrowCornClickablePanel');
        if (clickablePanel) {
            clickablePanel.style.display = type === 'arrow_corn' ? 'flex' : 'none';
        }
        
        // arrow_corn専用の面の矢印の位置調整パネルの表示/非表示を切り替え
        const faceArrowInnerOffsetPanel = document.getElementById('faceArrowInnerOffsetPanel');
        if (faceArrowInnerOffsetPanel) {
            faceArrowInnerOffsetPanel.style.display = type === 'arrow_corn' ? 'flex' : 'none';
            
            // arrow_cornが選択された場合、デフォルト値を適用
            if (type === 'arrow_corn') {
                const slider = document.getElementById('faceArrowInnerOffsetSlider');
                const input = document.getElementById('faceArrowInnerOffsetInput');
                if (slider && input) {
                    const defaultValue = parseFloat(slider.value) || 1.3;
                    this.setFaceArrowInnerOffset(defaultValue);
                }
            }
        }
        
        // 平行移動の矢印の追従ハンドル選択パネルの表示/非表示を切り替え
        const axisHandleFollowHandlePanel = document.getElementById('axisHandleFollowHandlePanel');
        if (axisHandleFollowHandlePanel) {
            axisHandleFollowHandlePanel.style.display = type === 'arrow_corn' ? 'flex' : 'none';
        }
        
        console.log('矢印タイプ変更:', type);
    }

    setArrowCornClickableVisible(visible) {
        if (!this.trimBoxManipulator) {
            return;
        }
        
        // arrow_cornでない場合は何もしない
        if (this.trimBoxManipulator.arrowType !== 'arrow_corn') {
            return;
        }
        
        this.trimBoxManipulator.setArrowCornClickableVisible(visible);
        
        // トグルの値を更新
        const toggle = document.getElementById('toggleArrowCornClickable');
        if (toggle) {
            toggle.checked = visible;
        }
        
        console.log('arrow_cornクリック可能領域表示状態:', visible);
    }

    setFaceArrowInnerOffset(innerOffset) {
        // arrow_corn専用の面の矢印を内側に移動させる
        // innerOffset: 0～2.0の範囲で、内側への移動量
        // arrowCornPositionOffset = 1.0 - innerOffset として、内側に移動させる
        if (!this.trimBoxManipulator) {
            return;
        }
        const offset = 1.0 - innerOffset; // デフォルト1.0から内側に移動
        this.trimBoxManipulator.setArrowCornPositionOffset(offset);
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
                // ハンドルのスケールをカメラ距離に応じて更新
                this.trimBoxManipulator.updateHandleScales();
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

export { PLYViewer };
