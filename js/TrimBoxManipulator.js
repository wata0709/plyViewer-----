import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

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
        this.axisHandles = []; // 軸制約移動用のハンドル（X、Y、Z軸矢印）
        this.initialEdgeRotations = []; // エッジハンドルの初期回転を保存
        this.showAxes = false; // 軸表示フラグ
        this.isDragging = false;
        this.activeHandle = null;
        this.selectedFace = null; // 選択された面
        this.hoveredHandle = null; // ホバー中のハンドル
        this.hoveredFaceHandle = null; // ホバー表示中の面ハンドル
        this.initialMousePos = new THREE.Vector2();
        this.initialBoxSize = new THREE.Vector3();
        this.initialBoxPos = new THREE.Vector3();
        
        // 長押し検出用の変数
        this.longPressTimer = null;
        this.longPressDuration = 200; // 200ms で長押し判定
        this.isLongPressActive = false;
        this.clickedFaceIntersection = null;
        
        // 軸制約移動用の変数
        this.activeAxis = null; // 現在アクティブな軸: 'x', 'y', 'z', または null（自由移動）
        this.hoveredAxisHandle = null; // ホバー中の平行移動の矢印
        
        // 平行移動の矢印が追従するハンドル
        // followHandleType: 'edge' または 'corner'
        // followHandleIndex: エッジハンドルの場合0-3、頂点ハンドルの場合corner名（例: 'max-max-max'）
        this.followHandleType = 'edge'; // デフォルトはエッジハンドル
        this.followHandleIndex = 3; // デフォルトは左手前のエッジハンドル（index 3）
        
        // 平行移動の矢印の回転オフセット（度単位、各軸ごとにXYZ軸）
        // キー: 'x', 'y', 'z'
        // 現在の設定を保持：Y軸Y回転-90°、Z軸Z回転90°
        this.axisHandleRotations = {
            'x': { x: 0, y: 0, z: 0 },
            'y': { x: 0, y: -90, z: 0 },
            'z': { x: 0, y: 0, z: 90 }
        };
        
        // 平行移動の矢印の位置オフセット（各軸ごとにXYZ方向のオフセット）
        // キー: 'x', 'y', 'z'
        this.axisHandlePositions = {
            'x': { x: -0.91, y: -0.50, z: 0.57 },
            'y': { x: 0.57, y: 0.40, z: 0 },
            'z': { x: 0.00, y: -1.07, z: -0.9 }
        };
        
        // キー状態追跡
        this.isCommandPressed = false;
        
        // 固定サイズ用の変数
        this.fixedBoxSize = 0;
        this.targetPosition = new THREE.Vector3();
        this.currentScale = 1.0;
        
        // トリミング箱の色・透明度設定
        this.boxColor = 0xffffff; // デフォルトは白
        this.boxOpacity = 0.1; // 10%
        
        // エッジハンドル向き調整用
        this.edgeRotationOffset = 0; // 度単位での回転オフセット（全体）
        // 各ハンドルの個別回転（度単位）: [右上, 右下, 左上, 左下]
        this.individualEdgeXRotations = [-90, 90, 90, 90]; // X軸回転
        this.individualEdgeYRotations = [-90, 0, 0, -90]; // Y軸回転
        this.individualEdgeZRotations = [0, 0, 90, 0]; // Z軸回転
        
        // 円錐のサイズパラメータ（デフォルト値）
        this.arrowOffset = 0.75;      // 引き出し線の長さ（箱から矢印までの距離）
        this.coneRadius = 0.200;      // 円錐の底面半径
        this.coneHeight = 0.550;      // 矢印の頭の大きさ
        this.leaderThickness = 3;     // 引き出し線の太さ
        this.leaderRadius = this.leaderThickness * 0.01; // 0.03
        
        // カスタム矢印関連
        this.customArrowModel = null;    // カスタムOBJモデル（arrow.obj）
        this.customArrowCornModel = null; // カスタムOBJモデル（arrow_corn.obj）
        this.customArrowParallelMovementModel = null; // カスタムOBJモデル（arrow_corn_parallelMovement.obj）
        this.customArrowScale = 0.150;    // カスタム矢印のスケール
        this.customArrowLoaded = false;  // カスタム矢印が読み込まれたかどうか
        this.customArrowCornLoaded = false; // arrow_cornが読み込まれたかどうか
        this.customArrowParallelMovementLoaded = false; // arrow_corn_parallelMovementが読み込まれたかどうか
        this.arrowType = 'arrow'; // 現在の矢印タイプ: 'arrow' または 'arrow_corn'
        
        // arrow_corn専用の回転オフセット（度単位、各面ごとにXYZ軸）
        // キー: 'x+', 'x-', 'y+', 'y-', 'z+', 'z-'
        // デフォルト: すべての面のZ軸を90度に設定
        this.arrowCornRotations = {
            'x+': { x: 0, y: 0, z: 90 },
            'x-': { x: 0, y: 0, z: 90 },
            'y+': { x: 0, y: 0, z: 90 },
            'y-': { x: 0, y: 0, z: 90 },
            'z+': { x: 0, y: 0, z: 90 },
            'z-': { x: 0, y: 0, z: 90 }
        };
        
        // arrow_corn専用の位置オフセット（すべての矢印を同じ距離だけ外側に移動）
        this.arrowCornPositionOffset = 1.0; // デフォルトは1.0
        
        // arrow_corn専用のクリック可能領域のマージン（各軸ごとの拡張率）
        this.arrowCornClickableMargin = {
            x: 0.5,  // X軸方向のマージン（デフォルト50%拡張）
            y: 7.0, // Y軸方向のマージン（デフォルト1000%拡張）
            z: 7.0  // Z軸方向のマージン（デフォルト1000%拡張）
        };
        
        // arrow_corn専用のクリック可能領域の表示状態
        this.arrowCornClickableVisible = true; // デフォルトは表示
        
        // 回転ハンドル関連
        this.rotaryHandleEnableModel = null;    // デフォルト状態の回転ハンドルOBJモデル
        this.rotaryHandleActiveModel = null;   // アクティブ状態の回転ハンドルOBJモデル
        this.rotaryHandleScale = 0.05;        // 回転ハンドルのスケール（デフォルト220%）
        this.rotaryHandleLoaded = false;       // 回転ハンドルが読み込まれたかどうか
        this.activeHandlePositionOffset = new THREE.Vector3(0.070, -0.070, 0.000); // アクティブハンドルの位置オフセット
        this.rotaryHandleHitboxRadius = 0.15;  // 回転ハンドルの当たり判定用球体の半径（見た目を変えずにクリック範囲を広げる）
        
        // Z軸矢印の回転設定
        this.zArrowRotationEnabled = true;   // Z軸矢印がカメラに向くか
        this.zArrowRotationAxis = 'y';       // Z軸矢印の回転軸 ('x', 'y', 'z')

        // 面ハイライト用
        this.faceHighlight = null; // ハイライト表示用の面メッシュ
        this.edgeHighlights = []; // ハイライト表示用の辺ライン配列

        this.raycaster = new THREE.Raycaster();
        // Lineのレイキャスト判定を厳密にする
        this.raycaster.params.Line.threshold = 0.05; // デフォルト: 1
        this.mouse = new THREE.Vector2();
        
        
        this.setupEventListeners();
        this.loadCustomArrowModel(); // カスタム矢印モデルを読み込み
        this.loadCustomArrowCornModel(); // arrow_cornモデルを読み込み
        this.loadCustomArrowParallelMovementModel(); // arrow_corn_parallelMovementモデルを読み込み
        this.loadRotaryHandleModels(); // 回転ハンドルモデルを読み込み
    }

    async loadCustomArrowModel() {
        try {
            const loader = new OBJLoader();
            this.customArrowModel = await new Promise((resolve, reject) => {
                loader.load('OBJ/arrow.obj', resolve, undefined, reject);
            });
            
            // モデルのスケールとマテリアルを設定
            this.customArrowModel.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                }
            });
            
            this.customArrowLoaded = true;
            console.log('カスタム矢印モデル (arrow.obj) の読み込み完了');
        } catch (error) {
            console.error('カスタム矢印モデルの読み込みに失敗:', error);
            this.customArrowLoaded = false;
        }
    }

    async loadCustomArrowCornModel() {
        try {
            const loader = new OBJLoader();
            this.customArrowCornModel = await new Promise((resolve, reject) => {
                loader.load('OBJ/arrow_corn.obj', resolve, undefined, reject);
            });
            
            // モデルのスケールとマテリアルを設定
            this.customArrowCornModel.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                }
            });
            
            this.customArrowCornLoaded = true;
            console.log('カスタム矢印モデル (arrow_corn.obj) の読み込み完了');
        } catch (error) {
            console.error('arrow_cornモデルの読み込みに失敗:', error);
            this.customArrowCornLoaded = false;
        }
    }

    async loadCustomArrowParallelMovementModel() {
        try {
            const loader = new OBJLoader();
            this.customArrowParallelMovementModel = await new Promise((resolve, reject) => {
                loader.load('OBJ/arrow_corn_parallelMovement.obj', resolve, undefined, reject);
            });
            
            // モデルのスケールとマテリアルを設定
            this.customArrowParallelMovementModel.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                }
            });
            
            this.customArrowParallelMovementLoaded = true;
            console.log('カスタム矢印モデル (arrow_corn_parallelMovement.obj) の読み込み完了');
            
            // モデルが読み込まれたら、軸ハンドルを作成
            if (this.trimBox) {
                this.createAxisHandles();
            }
        } catch (error) {
            console.error('arrow_corn_parallelMovementモデルの読み込みに失敗:', error);
            this.customArrowParallelMovementLoaded = false;
        }
    }

    async loadRotaryHandleModels() {
        try {
            const loader = new OBJLoader();
            
            // デフォルト状態のモデルを読み込み
            this.rotaryHandleEnableModel = await new Promise((resolve, reject) => {
                loader.load('OBJ/rotaryHandleEnable.obj', resolve, undefined, reject);
            });
            
            // アクティブ状態のモデルを読み込み
            this.rotaryHandleActiveModel = await new Promise((resolve, reject) => {
                loader.load('OBJ/rotaryHandleActive.obj', resolve, undefined, reject);
            });
            
            // モデルのマテリアルを設定
            [this.rotaryHandleEnableModel, this.rotaryHandleActiveModel].forEach(model => {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
                    }
                });
            });
            
            this.rotaryHandleLoaded = true;
            console.log('回転ハンドルモデルの読み込み完了');
        } catch (error) {
            console.error('回転ハンドルモデルの読み込みに失敗:', error);
            this.rotaryHandleLoaded = false;
        }
    }

    setupEventListeners() {
        this.renderer.domElement.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.renderer.domElement.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.renderer.domElement.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
        // キャンバス外でボタンを離した場合でもドラッグ解除されるようにする
        document.addEventListener('mouseup', (e) => this.onMouseUp(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        window.addEventListener('pointerup', (e) => this.onMouseUp(e));
        window.addEventListener('blur', () => this.cancelTrimming());
        
        // キーイベントリスナー
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isDragging) {
                    this.cancelTrimming();
                } else if (this.selectedFace) {
                    this.deselectFace();
                }
            }
            // Commandキー（Mac）またはCtrlキー（Windows/Linux）の検出
            if (e.metaKey || e.ctrlKey) {
                this.isCommandPressed = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            // Commandキー（Mac）またはCtrlキー（Windows/Linux）のリリース検出
            if (!e.metaKey && !e.ctrlKey) {
                this.isCommandPressed = false;
            }
        });
    }

    create(boundingBox, useFullRange = false) {
        // 全範囲スライスの場合、既存の箱の高さを保存
        let existingBoxHeight = null;
        if (useFullRange && this.trimBox && this.trimBox.geometry) {
            existingBoxHeight = this.trimBox.geometry.parameters.height;
        }
        
        this.clear();
        
        // アクティブなハンドル状態をリセット
        this.activeHandle = null;
        this.hoveredHandle = null;
        this.hoveredFaceHandle = null;
        this.hoveredAxisHandle = null;
        this.isDragging = false;
        
        // モデルの中心を取得（サイズ計算用）
        const modelCenter = boundingBox.getCenter(new THREE.Vector3());
        const modelSize = boundingBox.getSize(new THREE.Vector3());
        
        let boxCenter;
        let boxWidth, boxHeight, boxDepth;
        
        if (useFullRange) {
            // 全範囲スライスの場合：バウンディングボックスのサイズと位置を使用
            boxCenter = modelCenter.clone();
            
            // X方向とZ方向はモデル全体を囲むように広げる（5%のマージン）
            boxWidth = modelSize.x * 1.05;
            boxDepth = modelSize.z * 1.05;
            
            // Y方向（高さ）は既存の箱があればそれを保持、なければモデルのY方向のサイズを使用
            if (existingBoxHeight !== null) {
                // 既存の箱のY方向のサイズを保持
                boxHeight = existingBoxHeight;
            } else {
                // 既存の箱がない場合はモデルのY方向のサイズを使用
                boxHeight = modelSize.y * 1.05;
            }
        } else {
            // 通常のスライスモード：画面サイズに基づいて箱サイズを計算
            // 箱を配置する位置を決定（カメラターゲット位置より手前）
            const cameraDirection = new THREE.Vector3();
            this.camera.getWorldDirection(cameraDirection);
            
            // カメラからターゲットまでの距離の70%の位置に配置（手前に）
            const targetDistance = this.camera.position.distanceTo(this.controls.target);
            const boxDistance = targetDistance * 0.7;
            boxCenter = this.camera.position.clone().add(cameraDirection.multiplyScalar(boxDistance));
            
            // Y座標はモデルのY座標中央を使用
            boxCenter.y = modelCenter.y;
            
            // 初期表示時のみ画面サイズに基づいて箱サイズを計算
            // カメラからターゲット位置までの距離を使用
            const cameraDistance = this.camera.position.distanceTo(boxCenter);
            const fov = this.camera.fov * (Math.PI / 180);
            
            // 画面の30%程度のサイズになるように計算（立方体）
            const viewportHeight = 2 * Math.tan(fov / 2) * cameraDistance;
            boxWidth = boxHeight = boxDepth = viewportHeight * 0.3;
        }
        
        const geometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
        const material = new THREE.MeshBasicMaterial({
            color: this.boxColor,
            transparent: true,
            opacity: this.boxOpacity,
            side: THREE.DoubleSide
        });
        
        this.trimBox = new THREE.Mesh(geometry, material);
        this.trimBox.position.copy(boxCenter);
        this.scene.add(this.trimBox);
        
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: this.boxColor, 
            linewidth: 2,
            depthTest: false,  // 深度テストを無効にして常に最前面に表示
            depthWrite: false, // 深度バッファに書き込まない
            transparent: true  // 透明度設定を有効にする
        });
        this.boxHelper = new THREE.LineSegments(edges, lineMaterial);
        this.boxHelper.position.copy(boxCenter);
        this.boxHelper.renderOrder = 10000; // 非常に高い順序で常に最前面に表示
        this.scene.add(this.boxHelper);
        

        
        // 初期の3D空間でのサイズと位置を保存
        // 直方体の場合は最大のサイズを使用（後方互換性のため）
        this.fixedBoxSize = useFullRange ? Math.max(boxWidth, boxHeight, boxDepth) : boxWidth;
        this.targetPosition = boxCenter.clone();
        this.currentScale = 1.0;
        
        this.createHandles();
        console.log('新しいマニピュレーターを作成:', { 
            fixedBoxSize: this.fixedBoxSize, 
            position: this.targetPosition,
            width: boxWidth,
            height: boxHeight,
            depth: boxDepth,
            useFullRange: useFullRange
        });
    }

    createHandles() {
        // 念のため、既存のハンドルをすべて削除
        [...this.handles, ...this.faceHandles, ...this.edgeHandles, ...this.cornerHandles].forEach(handle => {
            if (handle && handle.parent) {
                this.scene.remove(handle);
            }
        });
        
        this.handles = [];
        this.faceHandles = [];
        this.edgeHandles = [];
        this.cornerHandles = [];
        this.axisHandles = [];
        this.initialEdgeRotations = []; // 初期回転をリセット
        this.activeHandle = null; // アクティブなハンドルをリセット
        this.hoveredHandle = null; // ホバー中のハンドルをリセット
        this.hoveredFaceHandle = null; // ホバー中の面ハンドルをリセット
        this.selectedFace = null; // 選択された面をリセット
        this.activeAxis = null; // 軸制約をリセット
        
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
        
        // エッジハンドル（OBJモデルを使用、Y軸回転用の4辺のみ）
        
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
        const offset = this.getArrowPlacementOffset(); // 箱から離す距離（動的設定、矢印の基準オフセットを補正）
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
            const handle = this.createArrowGeometry(handleData);
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
        
        // エッジハンドルを作成（OBJモデルを使用）
        edgePositions.forEach((handleData, index) => {
            const group = new THREE.Group();
            
            // OBJモデルが読み込まれていない場合はジオメトリベースのフォールバック
            if (!this.rotaryHandleLoaded || !this.rotaryHandleEnableModel) {
                console.warn('回転ハンドルモデルが読み込まれていません。ジオメトリベースのハンドルを使用します。');
                const edgeHandleGeometry = this.createQuarterCircleTubeGeometry();
                const edgeHandleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
                const handle = new THREE.Mesh(edgeHandleGeometry, edgeHandleMaterial);
                group.add(handle);
                this.orientQuarterCircleHandle(group, group.userData);
            } else {
                // デフォルト状態のモデルを追加
                const enableHandle = this.rotaryHandleEnableModel.clone();
                enableHandle.scale.set(this.rotaryHandleScale, this.rotaryHandleScale, this.rotaryHandleScale);
                enableHandle.traverse((child) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        child.material.color.setHex(0xffffff);
                    }
                });
                enableHandle.name = 'enableHandle';
                group.add(enableHandle);
                
                // アクティブ状態のモデルを追加（初期は非表示）
                const activeHandle = this.rotaryHandleActiveModel.clone();
                activeHandle.scale.set(this.rotaryHandleScale, this.rotaryHandleScale, this.rotaryHandleScale);
                activeHandle.position.copy(this.activeHandlePositionOffset); // 位置を調整
                activeHandle.traverse((child) => {
                    if (child.isMesh) {
                        child.material = child.material.clone();
                        child.material.color.setHex(0xffffff);
                    }
                });
                activeHandle.name = 'activeHandle';
                activeHandle.visible = false; // 初期は非表示
                group.add(activeHandle);
                
                // 円の4分の1を適切に配置
                this.orientQuarterCircleHandle(group, group.userData);
            }
            
            // 見えない当たり判定用の球体を追加（クリック範囲を広げるため）
            const hitboxGeometry = new THREE.SphereGeometry(this.rotaryHandleHitboxRadius, 16, 16);
            const hitboxMaterial = new THREE.MeshBasicMaterial({ 
                transparent: true,
                opacity: 0,  // 完全に透明（見た目には影響しない）
                visible: true  // Raycasterで検出可能にするためtrueに設定
            });
            const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            hitbox.name = 'hitbox';
            hitbox.userData = { isHitbox: true };
            group.add(hitbox);
            
            group.position.copy(handleData.pos);
            group.userData = { ...handleData, handleIndex: index, type: 'edge' };
            
            this.scene.add(group);
            this.handles.push(group);
            this.edgeHandles.push(group);
            console.log('エッジハンドル作成:', { 
                type: handleData.type, 
                edgeType: handleData.edgeType, 
                handleIndex: index,
                usesOBJModel: this.rotaryHandleLoaded
            });
        });
        
        // 回転軸を作成（初期は非表示）
        this.createRotationAxes();
        
        // 軸制約移動用のハンドルを作成
        this.createAxisHandles();
        
        // ハンドルの位置と向きを更新（デフォルトの個別回転設定を適用）
        this.updateHandlePositions();
        
        // 更新後の回転を初期回転として保存
        this.edgeHandles.forEach((handle, index) => {
            if (handle && this.trimBox) {
                const boxRotation = this.trimBox.rotation;
                const handleQuaternion = new THREE.Quaternion().setFromEuler(handle.rotation);
                const boxQuaternion = new THREE.Quaternion().setFromEuler(boxRotation);
                
                // 相対回転 = 箱の逆回転 * ハンドルの現在回転
                const relativeQuaternion = boxQuaternion.clone().invert().multiply(handleQuaternion);
                const relativeEuler = new THREE.Euler().setFromQuaternion(relativeQuaternion);
                
                this.initialEdgeRotations[index] = {
                    x: relativeEuler.x,
                    y: relativeEuler.y,
                    z: relativeEuler.z
                };
            }
        });
    }

    getFollowHandlePosition() {
        // 追従するハンドルの位置を取得
        if (this.followHandleType === 'edge') {
            if (this.edgeHandles.length <= this.followHandleIndex) {
                console.warn('エッジハンドルが不足しています');
                return null;
            }
            return this.edgeHandles[this.followHandleIndex].position.clone();
        } else if (this.followHandleType === 'corner') {
            const cornerHandle = this.cornerHandles.find(h => h.userData && h.userData.corner === this.followHandleIndex);
            if (!cornerHandle) {
                console.warn('頂点ハンドルが見つかりません:', this.followHandleIndex);
                return null;
            }
            return cornerHandle.position.clone();
        }
        return null;
    }

    createAxisHandles() {
        // 既存の軸ハンドルを削除
        this.axisHandles.forEach(handle => {
            if (handle && handle.parent) {
                this.scene.remove(handle);
            }
        });
        this.axisHandles = [];

        // arrow_corn_parallelMovementモデルが読み込まれていない場合はスキップ
        if (!this.customArrowParallelMovementModel || !this.customArrowParallelMovementLoaded) {
            console.log('arrow_corn_parallelMovementモデルが読み込まれていないため、軸ハンドルを作成しません');
            return;
        }

        // 追従するハンドルの位置を取得
        const basePosition = this.getFollowHandlePosition();
        if (!basePosition) {
            console.warn('追従するハンドルの位置を取得できません');
            return;
        }

        // 箱のサイズを取得
        const boxSize = new THREE.Vector3();
        this.trimBox.geometry.parameters ? 
            boxSize.set(
                this.trimBox.geometry.parameters.width / 2,
                this.trimBox.geometry.parameters.height / 2,
                this.trimBox.geometry.parameters.depth / 2
            ) : boxSize.setFromMatrixScale(this.trimBox.matrixWorld);

        // 箱の上面中央に配置（Y軸方向にオフセット）
        const offsetY = boxSize.y + 0.5; // 箱の上面から0.5単位上に配置

        // X、Y、Z軸の3つの矢印を作成
        const axes = [
            { axis: 'x', direction: new THREE.Vector3(1, 0, 0), color: 0xff0000 }, // 赤（X軸）
            { axis: 'y', direction: new THREE.Vector3(0, 1, 0), color: 0x00ff00 }, // 緑（Y軸）
            { axis: 'z', direction: new THREE.Vector3(0, 0, 1), color: 0x0000ff }  // 青（Z軸）
        ];

        axes.forEach((axisData, index) => {
            // 矢印モデルをクローン
            const arrowGroup = new THREE.Group();
            const customArrow = this.customArrowParallelMovementModel.clone();

            // スケール設定
            customArrow.scale.set(this.customArrowScale, this.customArrowScale, this.customArrowScale);

            // マテリアルを設定（デフォルトは白、透明度30%）
            customArrow.traverse((child) => {
                if (child.isMesh) {
                    child.material = new THREE.MeshBasicMaterial({
                        color: 0xffffff, // 白
                        transparent: true,
                        opacity: 0.3 // 透明度30%
                    });
                    // 元の色をuserDataに保存（選択時に使用）
                    child.userData.originalColor = axisData.color;
                    child.userData.axis = axisData.axis;
                }
            });

            arrowGroup.add(customArrow);

            // クリック可能領域を作成（矢印を中心に囲む直方体）
            const box = new THREE.Box3().setFromObject(customArrow);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            // クリック可能領域のサイズを拡張（マージンを追加）
            const margin = 0.2; // 各方向に0.2のマージンを追加
            const clickableGeometry = new THREE.BoxGeometry(
                size.x + margin * 2,
                size.y + margin * 2,
                size.z + margin * 2
            );
            const clickableMaterial = new THREE.MeshBasicMaterial({
                color: axisData.color,
                transparent: true,
                opacity: 0, // 透明度0%（完全に透明だが当たり判定は残る）
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false
            });
            const clickableMesh = new THREE.Mesh(clickableGeometry, clickableMaterial);
            clickableMesh.position.copy(center);
            clickableMesh.userData.isAxisHandleClickable = true;
            clickableMesh.userData.isAxisHandle = true;
            arrowGroup.add(clickableMesh);

            // 位置を設定（追従ハンドルの位置 + 位置オフセット）
            const positionOffset = this.axisHandlePositions[axisData.axis] || { x: 0, y: 0, z: 0 };
            const localPosition = new THREE.Vector3(
                positionOffset.x,
                offsetY + positionOffset.y,
                positionOffset.z
            );

            // 箱の回転を考慮して位置を変換
            const boxRotation = this.trimBox.rotation;
            localPosition.applyEuler(boxRotation);
            localPosition.add(basePosition);
            arrowGroup.position.copy(localPosition);

            // 矢印の向きを設定
            arrowGroup.rotation.set(0, 0, 0);
            const axisDirection = axisData.direction.clone();
            axisDirection.applyEuler(boxRotation);
            
            // 矢印を軸方向に向ける
            arrowGroup.lookAt(arrowGroup.position.clone().add(axisDirection));

            // arrow_corn_parallelMovementの向きを調整（必要に応じて）
            // デフォルトでは矢印が正の方向を向くように設定
            if (axisData.axis === 'x') {
                arrowGroup.rotateY(Math.PI / 2);
            } else if (axisData.axis === 'z') {
                arrowGroup.rotateX(-Math.PI / 2);
            }
            // Y軸はそのまま（上向き）

            // 回転オフセットを適用
            const rotationOffset = this.axisHandleRotations[axisData.axis];
            if (rotationOffset) {
                arrowGroup.rotateX(rotationOffset.x * Math.PI / 180);
                arrowGroup.rotateY(rotationOffset.y * Math.PI / 180);
                arrowGroup.rotateZ(rotationOffset.z * Math.PI / 180);
            }

            // userDataを設定
            arrowGroup.userData = {
                type: 'axis',
                axis: axisData.axis,
                color: axisData.color
            };

            this.scene.add(arrowGroup);
            this.handles.push(arrowGroup);
            this.axisHandles.push(arrowGroup);

            console.log('軸ハンドル作成:', {
                axis: axisData.axis,
                position: localPosition.toArray(),
                color: axisData.color.toString(16)
            });
        });
        
        // 初期状態の見た目を設定
        this.updateAxisHandleAppearance();
    }

    createArrowGeometry(faceData = null) {
        // 選択された矢印モデルを取得
        let arrowModel = null;
        if (this.arrowType === 'arrow_corn') {
            if (!this.customArrowCornModel || !this.customArrowCornLoaded) {
                console.error('arrow_cornモデルが読み込まれていません');
                return new THREE.Group(); // 空のグループを返す
            }
            arrowModel = this.customArrowCornModel;
        } else {
            if (!this.customArrowModel || !this.customArrowLoaded) {
                console.error('カスタム矢印モデルが読み込まれていません');
                return new THREE.Group(); // 空のグループを返す
            }
            arrowModel = this.customArrowModel;
        }
        
        const arrowGroup = new THREE.Group();
        const customArrow = arrowModel.clone();
        
        // スケールを適用
        customArrow.scale.set(this.customArrowScale, this.customArrowScale, this.customArrowScale);
        
        // すべての子オブジェクトのマテリアルを白色に設定し、renderOrderを設定
        customArrow.traverse((child) => {
            if (child.isMesh) {
                child.material = child.material.clone();
                child.material.color.setHex(0xffffff); // 白色
                child.renderOrder = 100; // 矢印本体は低い順序
            }
        });
        
        arrowGroup.add(customArrow);
        
        // クリック可能な領域を追加
        if (this.arrowType === 'arrow_corn') {
            // arrow_cornの場合: 直方体のクリック可能領域を作成（透明度50%）
            // arrow_cornモデルのバウンディングボックスを取得
            const box = new THREE.Box3().setFromObject(customArrow);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            
            // マージンを追加してクリックしやすくする（各軸ごとに調整可能）
            const marginX = this.arrowCornClickableMargin.x;
            const marginY = this.arrowCornClickableMargin.y;
            const marginZ = this.arrowCornClickableMargin.z;
            const clickableWidth = size.x * (1 + marginX);
            const clickableHeight = size.y * (1 + marginY);
            const clickableDepth = size.z * (1 + marginZ);
            
            const clickableGeometry = new THREE.BoxGeometry(clickableWidth, clickableHeight, clickableDepth);
            const clickableMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: this.arrowCornClickableVisible ? 0.5 : 0, // 表示状態に応じて透明度を変更
                depthTest: true,
                depthWrite: false,
                visible: true // レイキャスト用に常にvisibleをtrueに（見た目はopacityで制御）
            });
            const clickableMesh = new THREE.Mesh(clickableGeometry, clickableMaterial);
            clickableMesh.position.copy(center); // モデルの中心に配置
            clickableMesh.renderOrder = 99; // 矢印本体より少し低い順序
            
            // クリック可能領域にもuserDataを設定（レイキャスト用）
            clickableMesh.userData.isClickableArea = true;
            clickableMesh.userData.isArrowCornClickable = true; // arrow_corn用のクリック可能領域であることを示す
            
            arrowGroup.add(clickableMesh);
        } else {
            // arrowの場合: 円柱のクリック可能領域（従来通り）
            const clickableRadius = this.customArrowScale * 3.0; // 矢印の3倍の半径
            const clickableHeight = this.customArrowScale * 10.0; // 矢印の10倍の高さ
            const clickableGeometry = new THREE.CylinderGeometry(clickableRadius, clickableRadius, clickableHeight, 8);
            const clickableMaterial = new THREE.MeshBasicMaterial({
                color: 0xffffff,
                transparent: true,
                opacity: 0, // 完全に透明
                depthTest: true,
                depthWrite: false
            });
            const clickableMesh = new THREE.Mesh(clickableGeometry, clickableMaterial);
            clickableMesh.renderOrder = 99; // 矢印本体より少し低い順序
            
            // クリック可能領域にもuserDataを設定（レイキャスト用）
            clickableMesh.userData.isClickableArea = true;
            
            arrowGroup.add(clickableMesh);
        }
        
        return arrowGroup;
    }

    createQuarterCircleTubeGeometry() {
        // 円の4分の1の太いチューブを作成
        const ringRadius = 0.40; // 回転ハンドルの円半径（少し大きく）
        const curve = new THREE.EllipseCurve(
            0, 0,            // 中心
            ringRadius, ringRadius,      // 半径
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

        // 矢印用に曲線の始点・終点と接線方向（ローカル座標）を記録
        const radius = ringRadius;
        const startAngle = 0;
        const endAngle = Math.PI / 2;
        // 始点・終点（回転前のローカル）
        const startPos = new THREE.Vector3(Math.cos(startAngle) * radius, 0, Math.sin(startAngle) * radius); // (r,0,0)
        const endPos = new THREE.Vector3(Math.cos(endAngle) * radius, 0, Math.sin(endAngle) * radius);       // (0,0,r)
        // 接線（回転前）
        const startTan = new THREE.Vector3(-Math.sin(startAngle), 0, Math.cos(startAngle)); // (0,0,1)
        const endTan = new THREE.Vector3(-Math.sin(endAngle), 0, Math.cos(endAngle));       // (-1,0,0)
        // X軸-90度回転を反映
        const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI / 2);
        startPos.applyQuaternion(rotX);
        endPos.applyQuaternion(rotX);
        startTan.applyQuaternion(rotX);
        endTan.applyQuaternion(rotX);
        tubeGeometry.userData.edgeEndpoints = {
            start: { pos: startPos, dir: startTan.normalize() },
            end: { pos: endPos, dir: endTan.normalize() }
        };
        
        return tubeGeometry;
    }

    orientArrowHandle(handle, handleData) {
        // 矢印をカメラに向ける（各軸周りの回転のみ）
        const { axis, direction } = handleData;
        
        // 矢印の位置からカメラへのベクトル
        const arrowPos = handle.position;
        const cameraPos = this.camera.position;
        const toCamera = new THREE.Vector3().subVectors(cameraPos, arrowPos);
        
        // 基本的な向きを設定（法線方向）
        handle.rotation.set(0, 0, 0);
        
        switch (axis) {
            case 'x':
                // X軸方向の矢印: X軸周りの回転のみ
                // まず基本の向きを設定
                if (direction > 0) {
                    handle.rotation.z = -Math.PI / 2; // +X方向
                } else {
                    handle.rotation.z = Math.PI / 2;  // -X方向
                }
                // X軸周りでカメラに向ける（90度オフセット追加）
                const angleX = Math.atan2(toCamera.z, toCamera.y) + Math.PI / 2;
                handle.rotation.x = angleX;
                break;
                
            case 'y':
                // Y軸方向の矢印: Y軸周りの回転のみ
                // まず基本の向きを設定
                if (direction > 0) {
                    // +Y方向（上向き）デフォルト
                } else {
                    handle.rotation.z = Math.PI; // -Y方向（下向き）
                }
                // Y軸周りでカメラに向ける
                const angleY = Math.atan2(toCamera.x, toCamera.z);
                handle.rotation.y = angleY;
                break;
                
            case 'z':
                // Z軸方向の矢印: 設定に応じてカメラに向くか固定
                if (direction > 0) {
                    handle.rotation.x = Math.PI / 2;  // +Z方向
                } else {
                    handle.rotation.x = -Math.PI / 2; // -Z方向
                }
                
                // Z軸矢印の回転が有効な場合、指定された軸周りでカメラに向ける（符号反転）
                if (this.zArrowRotationEnabled) {
                    switch (this.zArrowRotationAxis) {
                        case 'x':
                            // X軸周りの回転
                            const angleZX = -Math.atan2(toCamera.y, toCamera.z);
                            handle.rotation.x += angleZX;
                            break;
                        case 'y':
                            // Y軸周りの回転
                            const angleZY = -Math.atan2(toCamera.x, toCamera.z);
                            handle.rotation.y = angleZY;
                            break;
                        case 'z':
                            // Z軸周りの回転
                            const angleZZ = -Math.atan2(toCamera.y, toCamera.x);
                            handle.rotation.z = angleZZ;
                            break;
                    }
                }
                break;
        }
        
        // arrow_cornの場合のみ、追加の回転オフセットを適用
        if (this.arrowType === 'arrow_corn') {
            const faceKey = `${axis}${direction > 0 ? '+' : '-'}`;
            const rotationOffset = this.arrowCornRotations[faceKey];
            if (rotationOffset) {
                // 度をラジアンに変換して追加
                handle.rotation.x += rotationOffset.x * (Math.PI / 180);
                handle.rotation.y += rotationOffset.y * (Math.PI / 180);
                handle.rotation.z += rotationOffset.z * (Math.PI / 180);
            }
        }
    }
    
    // すべての矢印をカメラに向ける（アニメーションループで呼ばれる）
    updateArrowOrientations() {
        this.faceHandles.forEach(handle => {
            if (handle.visible && handle.userData) {
                this.orientArrowHandle(handle, handle.userData);
            }
        });
    }

    orientQuarterCircleHandle(handle, handleData) {
        const isGroup = handle.type === 'Group';
        const tube = isGroup ? handle.children[0] : handle;
        // インデックスベースの固定パターンで向きを決定
        // 角度パターン: [π/2, 0, π, -π/2] （右奥、右手前、左奥、左手前）
        const anglePatterns = [
            Math.PI / 2,  // index 0: 右奥の辺 - 円が右奥向き
            0,            // index 1: 右手前の辺 - 円が右手前向き
            Math.PI,      // index 2: 左奥の辺 - 円が左奥向き
            -Math.PI / 2  // index 3: 左手前の辺 - 円が左手前向き
        ];
        
        const handleIndex = handleData.handleIndex || 0;
        const baseAngleY = anglePatterns[handleIndex % 4];
        
        // ユーザー調整オフセットを適用（個別設定優先）
        const globalYOffsetRadians = (this.edgeRotationOffset || 0) * (Math.PI / 180);
        const individualYOffsetRadians = (this.individualEdgeYRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualXOffsetRadians = (this.individualEdgeXRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualZOffsetRadians = (this.individualEdgeZRotations[handleIndex] || 0) * (Math.PI / 180);
        
        handle.rotation.x = individualXOffsetRadians;
        handle.rotation.y = baseAngleY + globalYOffsetRadians + individualYOffsetRadians;
        handle.rotation.z = individualZOffsetRadians;

        // 矢印ヘッドの向き・位置をチューブの端点に合わせる
        if (isGroup && tube.geometry && tube.geometry.userData && tube.geometry.userData.edgeEndpoints) {
            const { start, end } = tube.geometry.userData.edgeEndpoints;
            const headStart = handle.children[1];
            const headEnd = handle.children[2];
            // ローカル端点に配置
            headStart.position.copy(start.pos);
            headEnd.position.copy(end.pos);
            // 向き: 片方は接線方向の逆、もう片方は接線方向（反転）
            headStart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), start.dir.clone().multiplyScalar(-1).normalize());
            headEnd.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.dir.clone().normalize());
        }
        
        // デバッグ用ログ
        console.log('エッジハンドル向き設定:', { 
            handleIndex, 
            baseAngleY: baseAngleY * (180 / Math.PI),
            finalAngleY: handle.rotation.y * (180 / Math.PI)
        });
    }

    orientQuarterCircleHandleWithRotation(handle, handleData, boxRotation) {
        // インデックスベースの固定パターンで向きを決定（箱の回転は除去）
        // 角度パターン: [π/2, 0, π, -π/2] （右奥、右手前、左奥、左手前）
        const anglePatterns = [
            Math.PI / 2,  // index 0: 右奥の辺 - 円が右奥向き
            0,            // index 1: 右手前の辺 - 円が右手前向き
            Math.PI,      // index 2: 左奥の辺 - 円が左奥向き
            -Math.PI / 2  // index 3: 左手前の辺 - 円が左手前向き
        ];
        
        const handleIndex = handleData.handleIndex || 0;
        const baseAngleY = anglePatterns[handleIndex % 4];
        
        // ユーザー調整オフセットのみを適用（箱の回転は除去）
        const globalYOffsetRadians = (this.edgeRotationOffset || 0) * (Math.PI / 180);
        const individualYOffsetRadians = (this.individualEdgeYRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualXOffsetRadians = (this.individualEdgeXRotations[handleIndex] || 0) * (Math.PI / 180);
        const individualZOffsetRadians = (this.individualEdgeZRotations[handleIndex] || 0) * (Math.PI / 180);
        
        handle.rotation.x = individualXOffsetRadians;
        handle.rotation.y = baseAngleY + globalYOffsetRadians + individualYOffsetRadians;
        handle.rotation.z = individualZOffsetRadians;
    }

    onMouseDown(event) {
        // トリミングボックスが存在しない場合は何もしない
        if (!this.trimBox) {
            return;
        }
        
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
            
            // 円錐（Mesh）またはGroupの子要素がヒットした場合の処理
            let targetObject = intersects[0].object;
            console.log('初期targetObject:', { 
                type: targetObject.type, 
                hasUserData: !!targetObject.userData,
                userDataType: targetObject.userData?.type,
                position: targetObject.position
            });
            
            // userDataを持つ親を探す（最大3階層まで遡る）
            let currentObject = targetObject;
            for (let i = 0; i < 3; i++) {
                if (currentObject.userData && currentObject.userData.type) {
                    console.log('userDataを持つオブジェクト発見:', { 
                        type: currentObject.type, 
                        userData: currentObject.userData,
                        階層: i
                    });
                    targetObject = currentObject;
                    break;
                }
                if (currentObject.parent && currentObject.parent !== this.scene) {
                    currentObject = currentObject.parent;
                    console.log('親を辿る:', { 
                        type: currentObject.type, 
                        hasUserData: !!currentObject.userData,
                        userDataType: currentObject.userData?.type
                    });
                } else {
                    console.log('これ以上親がない、またはSceneに到達');
                    break;
                }
            }
            
            console.log('最終的なactiveHandle:', {
                type: targetObject.type,
                userDataType: targetObject.userData?.type,
                hasMaterial: !!targetObject.material
            });
            
            // edgeの子Meshが当たった場合は親GroupをactiveHandleにする
            if (targetObject.userData && targetObject.userData.type === 'edge' && targetObject.type !== 'Group') {
                let parent = targetObject.parent;
                for (let i = 0; i < 3 && parent; i++) {
                    if (parent.type === 'Group') { targetObject = parent; break; }
                    parent = parent.parent;
                }
            }
            this.activeHandle = targetObject;
            this.initialMousePos.copy(this.mouse);
            
            // 操作タイプに応じて初期値を保存
            const userData = this.activeHandle.userData;
            console.log('ハンドル操作開始:', userData);
            this.initialBoxBounds = new THREE.Box3().setFromObject(this.trimBox);
            this.initialBoxPosition = this.trimBox.position.clone(); // 箱移動用の初期位置を保存
            
            // 軸ハンドルがクリックされた場合
            if (userData.type === 'axis') {
                console.log('軸ハンドルクリック:', userData.axis);
                this.activeAxis = userData.axis;
                this.updateAxisHandleAppearance(); // 選択状態の見た目を更新
                this.isDragging = true;
                this.isLongPressActive = true; // 長押しモードとして扱う
                this.activeHandle = { userData: { type: 'boxMove', axis: userData.axis } };
                this.renderer.domElement.style.cursor = 'grabbing';
                this.setBoxMoveColors(true);
                this.disableOrbitControls();
                this.showTrimmingInfo();
                return; // 早期リターン
            }
            
            if (userData.type === 'corner') {
                this.initialCornerPositions = this.getCornerPositions();
            } else if (userData.type === 'edge') {
                this.initialBoxRotation = this.trimBox.rotation.y;
            }
            
            // 面ハンドルをクリックした場合はその面を選択（他の矢印は消す）
            if (userData.type === 'face') {
                this.selectFace(this.activeHandle);

                // 対応する面をハイライト表示
                this.highlightFace(this.activeHandle);

                // 円錐（Mesh）の場合は直接material.colorを変更
                if (this.activeHandle.material) {
                    this.activeHandle.material.color.setHex(0x00dfff);
                    console.log('円錐色変更:', this.activeHandle.type);
                } else if (this.activeHandle.children) {
                    // Groupの全ての子要素（ネストされた要素も含む）の色を黄色に変更
                    console.log('面ハンドル色変更:', { childrenCount: this.activeHandle.children.length });
                    this.activeHandle.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.color.setHex(0x00dfff);
                            console.log('子要素の色変更:', child.type);
                        }
                    });
                }
            } else if (userData.type === 'edge') {
                // edgeはGroupかもしれないので、OBJモデルまたはtubeを黄色に＆ヘッドは表示＆黄色
                let group = this.activeHandle.type === 'Group' ? this.activeHandle : this.activeHandle.parent;
                if (group && group.type === 'Group') {
                    // OBJモデルを使用している場合
                    const enableHandle = group.getObjectByName('enableHandle');
                    const activeHandle = group.getObjectByName('activeHandle');
                    
                    if (enableHandle && activeHandle) {
                        // OBJモデルの場合：アクティブモデルを表示、デフォルトモデルを非表示
                        enableHandle.visible = false;
                        activeHandle.visible = true;
                        // アクティブモデルの色を黄色に変更
                        activeHandle.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.color.setHex(0x00dfff);
                            }
                        });
                    } else {
                        // ジオメトリベースの場合：従来の処理
                        const tube = group.children[0];
                        const headStart = group.children[1];
                        const headEnd = group.children[2];
                        if (tube && tube.material) tube.material.color.setHex(0x00dfff);
                        if (headStart) {
                            headStart.visible = true;
                            if (headStart.material) headStart.material.color.setHex(0x00dfff);
                        }
                        if (headEnd) {
                            headEnd.visible = true;
                            if (headEnd.material) headEnd.material.color.setHex(0x00dfff);
                        }
                    }
                } else if (this.activeHandle.material) {
                    this.activeHandle.material.color.setHex(0x00dfff);
                }
                
                // エッジハンドルがアクティブな時、面ハンドル（矢印）を非表示にする
                this.faceHandles.forEach(handle => {
                    if (handle) {
                        handle.visible = false;
                    }
                });
                
                console.log('通常ハンドル色変更:', userData.type);
            } else {
                this.activeHandle.material.color.setHex(0x00dfff);
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
                    console.log('箱の面をクリック - 面ハンドル表示 + 長押し待機開始');
                    
                    const intersection = boxIntersects[0];
                    
                    // 面ハンドルを表示（触った面の矢印を表示）
                    this.selectFaceFromIntersection(intersection);
                    
                    // 長押し検出を開始
                    this.startLongPressDetection(intersection);
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
        // 選択された矢印以外は非表示
        this.faceHandles.forEach(h => {
            h.visible = (h === faceHandle);
        });
        // ホバー中の矢印は解除
        if (this.hoveredFaceHandle && this.hoveredFaceHandle !== this.selectedFace) {
            this.hoveredFaceHandle.visible = false;
        }
        this.hoveredFaceHandle = null;
        

        
        // 円錐（面ハンドル）の色を白色に設定
        console.log('面選択時のハンドル情報:', {
            type: faceHandle.type,
            childrenCount: faceHandle.children ? faceHandle.children.length : 0,
            hasUserData: !!faceHandle.userData,
            hasMaterial: !!faceHandle.material
        });
        
        // 円錐（Mesh）の場合は直接material.colorを変更
        if (faceHandle.material) {
            faceHandle.material.color.setHex(0xffffff);
            console.log('円錐色設定完了:', faceHandle.type);
        } else if (faceHandle.children) {
            // Groupの子要素の色を白色に設定（後方互換性）
            faceHandle.children.forEach(child => {
                if (child.material) {
                    child.material.color.setHex(0xffffff);
                    console.log('子要素色設定:', child.type);
                }
            });
        }
        
        // 選択された面ハンドルをドラッグ可能なハンドルとして登録
        // ※この時点で面ハンドルは既にthis.handlesに含まれているはず
        
        console.log('面を選択:', faceHandle.userData);
        console.log('面ハンドルがhandlesに含まれているか:', this.handles.includes(faceHandle));
        console.log('現在のhandles数:', this.handles.length);
    }

    deselectFace() {
        if (this.selectedFace) {
            this.selectedFace.visible = false;

            // 面のハイライトもクリア
            this.clearFaceHighlight();

            // 辺のハイライトもクリア
            this.clearEdgeHighlights();

            this.selectedFace = null;

            console.log('面選択を解除');
        }
        // ホバー矢印を消去
        if (this.hoveredFaceHandle) {
            if (this.hoveredFaceHandle !== this.selectedFace) {
                this.hoveredFaceHandle.visible = false;
            }
            this.hoveredFaceHandle = null;
        }
        // 念のため他の面ハンドルも非表示（ホバー表示の取りこぼし対策）
        this.faceHandles.forEach(h => {
            if (h !== this.selectedFace) h.visible = false;
        });
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
        // トリミングボックスが存在しない場合は何もしない
        if (!this.trimBox) {
            return;
        }
        
        // マウス移動時に長押しタイマーをクリア（移動したら長押し判定をキャンセル）
        if (this.longPressTimer && !this.isLongPressActive) {
            this.clearLongPressTimer();
        }
        
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
            
            // ホバー処理（ドラッグ中は実施しない）
            let newHoveredHandle = null;
            if (intersects.length > 0) {
                // userDataを持つ親を探す（最大3階層まで遡る）
                let targetObject = intersects[0].object;
                let currentObject = targetObject;
                for (let i = 0; i < 3; i++) {
                    if (currentObject.userData && currentObject.userData.type) {
                        newHoveredHandle = currentObject;
                        break;
                    }
                    if (currentObject.parent && currentObject.parent !== this.scene) {
                        currentObject = currentObject.parent;
                    } else {
                        break;
                    }
                }
                this.renderer.domElement.style.cursor = 'grab';
            } else {
                this.renderer.domElement.style.cursor = 'default';
            }
            
            // ホバー状態の変更処理
            this.updateHoverState(newHoveredHandle);
            
            // 軸ハンドルのホバー状態を更新
            let newHoveredAxisHandle = null;
            if (newHoveredHandle && newHoveredHandle.userData && newHoveredHandle.userData.type === 'axis') {
                newHoveredAxisHandle = newHoveredHandle;
            }
            if (this.hoveredAxisHandle !== newHoveredAxisHandle) {
                this.hoveredAxisHandle = newHoveredAxisHandle;
                this.updateAxisHandleAppearance();
            }

            // 面またはその矢印にマウスがある間は該当矢印を表示し続ける
            let desiredFaceHandle = null;
            if (this.trimBox) {
                const faceIntersects = this.raycaster.intersectObject(this.trimBox);
                if (faceIntersects.length > 0) {
                    const intersection = faceIntersects[0];
                    const normal = intersection.face.normal.clone();
                    normal.transformDirection(this.trimBox.matrixWorld);
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
                    desiredFaceHandle = this.faceHandles.find(handle => 
                        handle.userData.axis === axis && handle.userData.direction === direction
                    ) || null;
                }
            }

            // newHoveredHandle が面ハンドルの場合はそれを優先
            if (!desiredFaceHandle && newHoveredHandle && newHoveredHandle.userData && newHoveredHandle.userData.type === 'face') {
                desiredFaceHandle = newHoveredHandle;
            }

            if (this.selectedFace) {
                // 選択中: 選択矢印は常時表示しつつ、ホバー中の矢印も並行表示
                if (desiredFaceHandle && desiredFaceHandle !== this.selectedFace) {
                    this.faceHandles.forEach(h => {
                        h.visible = (h === this.selectedFace || h === desiredFaceHandle);
                    });
                    this.hoveredFaceHandle = desiredFaceHandle;
                } else {
                    // ホバー対象が無い/選択と同一なら選択のみ表示
                    this.faceHandles.forEach(h => {
                        h.visible = (h === this.selectedFace);
                    });
                    if (this.hoveredFaceHandle && this.hoveredFaceHandle !== this.selectedFace) {
                        this.hoveredFaceHandle.visible = false;
                    }
                    this.hoveredFaceHandle = null;
                }
            } else {
                // 未選択: ホバー対象のみ表示
                if (desiredFaceHandle) {
                    this.faceHandles.forEach(h => {
                        h.visible = (h === desiredFaceHandle);
                    });
                    this.hoveredFaceHandle = desiredFaceHandle;
                } else {
                    // 何もホバーしていなければ全て非表示
                    this.faceHandles.forEach(h => { h.visible = false; });
                    if (this.hoveredFaceHandle) {
                        this.hoveredFaceHandle.visible = false;
                    }
                    this.hoveredFaceHandle = null;
                }
            }
            return;
        }
        
        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        // より精密なマウス移動量計算
        const deltaX = (this.mouse.x - this.initialMousePos.x);
        const deltaY = (this.mouse.y - this.initialMousePos.y);
        
        // 操作タイプに応じて感度を調整
        const userData = this.activeHandle.userData;
        let sensitivityMultiplier = 5; // デフォルト
        
        switch (userData.type) {
            case 'face':
                sensitivityMultiplier = 3; // 面操作は感度を下げて精密に
                break;
            case 'edge':
                sensitivityMultiplier = 4; // 回転操作は適度な感度
                break;
            case 'corner':
                sensitivityMultiplier = 3; // 頂点操作は精密に
                break;
            case 'boxMove':
                sensitivityMultiplier = 2; // 箱移動は最も精密に
                break;
        }
        
        const adjustedDeltaX = deltaX * sensitivityMultiplier;
        const adjustedDeltaY = deltaY * sensitivityMultiplier;
        
        // ドラッグ中のみ更新
        if (this.isDragging) {
            this.updateBoxFromHandle(adjustedDeltaX, adjustedDeltaY);
        }
    }

    onMouseUp(event) {
        // 長押しタイマーをクリア（マウスアップで長押し判定終了）
        this.clearLongPressTimer();
        
        // ドラッグ状態を必ず解除（先に実行）
        this.isDragging = false;
        this.isLongPressActive = false;
        this.clickedFaceIntersection = null;
        this.activeAxis = null; // 軸制約をリセット
        this.updateAxisHandleAppearance(); // 選択解除時の見た目を更新
        this.renderer.domElement.style.cursor = 'default';

        // 面のハイライトをクリア
        this.clearFaceHighlight();

        // 辺のハイライトをクリア
        this.clearEdgeHighlights();

        // ハンドル操作終了時にカメラコントロールを必ず再有効化
        this.enableOrbitControls();
        this.hideTrimmingInfo();
        
        if (this.activeHandle) {
            const wasEdgeHandle = this.activeHandle.userData && this.activeHandle.userData.type === 'edge';
            
            // エッジ（回転）ハンドルだった場合はヘッドを隠す＆色を戻す（子Meshがactiveでも親Groupを探す）
            if (wasEdgeHandle) {
                let group = null;
                let cur = this.activeHandle;
                for (let i = 0; i < 3 && cur; i++) {
                    if (cur.type === 'Group') { group = cur; break; }
                    cur = cur.parent;
                }
                if (group) {
                    // OBJモデルを使用している場合
                    const enableHandle = group.getObjectByName('enableHandle');
                    const activeHandle = group.getObjectByName('activeHandle');
                    
                    if (enableHandle && activeHandle) {
                        // OBJモデルの場合：デフォルトモデルを表示、アクティブモデルを非表示
                        enableHandle.visible = true;
                        activeHandle.visible = false;
                        // デフォルトモデルの色を白色に戻す
                        enableHandle.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.color.setHex(0xffffff);
                            }
                        });
                    } else {
                        // ジオメトリベースの場合：従来の処理
                        const tube = group.children[0];
                        const headStart = group.children[1];
                        const headEnd = group.children[2];
                        if (headStart) {
                            headStart.visible = false;
                            if (headStart.material) headStart.material.color.setHex(0xffffff);
                        }
                        if (headEnd) {
                            headEnd.visible = false;
                            if (headEnd.material) headEnd.material.color.setHex(0xffffff);
                        }
                        if (tube && tube.material) tube.material.color.setHex(0xffffff);
                    }
                } else if (this.activeHandle.material) {
                    // 最低限、色だけは戻す
                    this.activeHandle.material.color.setHex(0xffffff);
                }
                
                // エッジハンドルが非アクティブになった時、選択されている面があれば面ハンドルを再表示
                if (this.selectedFace) {
                    this.faceHandles.forEach(handle => {
                        if (handle && handle.userData) {
                            const selectedInfo = this.selectedFace.userData;
                            handle.visible = (handle.userData.axis === selectedInfo.axis && handle.userData.direction === selectedInfo.direction);
                        }
                    });
                }
            }
            // 箱移動モードの場合は色をリセット
            if (this.activeHandle.userData.type === 'boxMove') {
                this.setBoxMoveColors(false);
            } else {
                this.resetHandleColor(this.activeHandle);
            }
            this.activeHandle = null;
        }
        
        // 念のためホバー状態もリセット
        if (this.hoveredHandle) {
            this.resetHoverColor(this.hoveredHandle);
            this.hoveredHandle = null;
        }
    }

    onMouseLeave(event) {
        // マウスが3Dビューエリア外に出た時、ドラッグ状態も含めて完全リセット
        if (this.isDragging) {
            this.onMouseUp(event);
        }
        
        if (this.hoveredHandle) {
            this.resetHoverColor(this.hoveredHandle);
            this.hoveredHandle = null;
        }
        if (this.hoveredFaceHandle && this.hoveredFaceHandle !== this.selectedFace) {
            this.hoveredFaceHandle.visible = false;
        }
        this.hoveredFaceHandle = null;
        this.renderer.domElement.style.cursor = 'default';
    }


    updateHoverState(newHoveredHandle) {
        // 前にホバーしていたハンドルの色をリセット
        if (this.hoveredHandle && this.hoveredHandle !== newHoveredHandle) {
            this.resetHoverColor(this.hoveredHandle);
        }
        
        // 新しいハンドルにホバー色を適用
        if (newHoveredHandle && newHoveredHandle !== this.hoveredHandle) {
            this.setHoverColor(newHoveredHandle);
        }
        
        this.hoveredHandle = newHoveredHandle;
    }

    setHoverColor(handle) {
        if (!handle || !handle.userData) return;
        
        const userData = handle.userData;
        const hoverColor = 0x00dfff; // #00b2ff
        
        switch (userData.type) {
            case 'face':
                // 円錐（Mesh）の場合は直接material.colorを変更
                if (handle.material) {
                    handle.material.color.setHex(hoverColor);
                } else {
                    // Groupの全ての子要素（ネストされた要素も含む）の色を薄い黄色に変更
                    handle.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.color.setHex(hoverColor);
                        }
                    });
                }
                break;
            case 'edge':
                // Group（OBJモデルまたはチューブ＋ヘッド）を前提にする
                if (handle.type === 'Group') {
                    // OBJモデルを使用している場合
                    const enableHandle = handle.getObjectByName('enableHandle');
                    const activeHandle = handle.getObjectByName('activeHandle');
                    
                    if (enableHandle && activeHandle) {
                        // OBJモデルの場合：アクティブモデルを表示、デフォルトモデルを非表示
                        enableHandle.visible = false;
                        activeHandle.visible = true;
                    } else {
                        // ジオメトリベースの場合：従来の処理
                        const tube = handle.children[0];
                        const headStart = handle.children[1];
                        const headEnd = handle.children[2];
                        if (tube && tube.material) tube.material.color.setHex(hoverColor);
                        if (headStart) {
                            headStart.visible = true;
                            if (headStart.material) headStart.material.color.setHex(hoverColor);
                        }
                        if (headEnd) {
                            headEnd.visible = true;
                            if (headEnd.material) headEnd.material.color.setHex(hoverColor);
                        }
                    }
                } else if (handle.material) {
                    handle.material.color.setHex(hoverColor);
                }
                break;
            case 'corner':
                if (handle.material) {
                    handle.material.color.setHex(hoverColor);
                }
                break;
        }
    }

    resetHoverColor(handle) {
        if (!handle || !handle.userData) return;
        
        // アクティブなハンドルの場合は黄色を維持
        if (this.activeHandle === handle) return;
        
        const userData = handle.userData;
        const normalColor = 0xffffff; // 白色
        
        switch (userData.type) {
            case 'face':
                // 円錐（Mesh）の場合は直接material.colorを変更
                if (handle.material) {
                    handle.material.color.setHex(normalColor);
                } else {
                    // Groupの全ての子要素（ネストされた要素も含む）の色を白色に戻す
                    handle.traverse((child) => {
                        if (child.isMesh && child.material) {
                            child.material.color.setHex(normalColor);
                        }
                    });
                }
                break;
            case 'edge':
                if (handle.type === 'Group') {
                    // OBJモデルを使用している場合
                    const enableHandle = handle.getObjectByName('enableHandle');
                    const activeHandle = handle.getObjectByName('activeHandle');
                    
                    if (enableHandle && activeHandle) {
                        // OBJモデルの場合：デフォルトモデルを表示、アクティブモデルを非表示
                        enableHandle.visible = true;
                        activeHandle.visible = false;
                    } else {
                        // ジオメトリベースの場合：従来の処理
                        const tube = handle.children[0];
                        const headStart = handle.children[1];
                        const headEnd = handle.children[2];
                        if (tube && tube.material) tube.material.color.setHex(normalColor);
                        if (headStart) {
                            headStart.visible = false;
                            if (headStart.material) headStart.material.color.setHex(normalColor);
                        }
                        if (headEnd) {
                            headEnd.visible = false;
                            if (headEnd.material) headEnd.material.color.setHex(normalColor);
                        }
                    }
                } else if (handle.material) {
                    handle.material.color.setHex(normalColor);
                }
                break;
            case 'corner':
                if (handle.material) {
                    handle.material.color.setHex(normalColor);
                }
                break;
        }
    }


    // 長押し検出開始
    startLongPressDetection(intersection) {
        // 既存のタイマーをクリア
        this.clearLongPressTimer();
        
        // 長押し状態をリセット
        this.isLongPressActive = false;
        this.clickedFaceIntersection = intersection;
        
        // 長押しタイマーを開始
        this.longPressTimer = setTimeout(() => {
            console.log('長押し検出 - 箱移動モード開始');
            this.activateBoxMoveMode();
        }, this.longPressDuration);
        
        console.log('長押し検出タイマー開始:', this.longPressDuration + 'ms');
    }

    // 長押しタイマーをクリア
    clearLongPressTimer() {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
            console.log('長押しタイマークリア');
        }
    }

    // 箱移動モードを開始
    activateBoxMoveMode() {
        if (!this.clickedFaceIntersection) return;
        
        console.log('箱移動モード開始');
        
        // 箱移動モードを開始（自由移動）
        this.isDragging = true;
        this.isLongPressActive = true;
        this.activeAxis = null; // 自由移動
        this.activeHandle = { userData: { type: 'boxMove' } };
        this.initialMousePos.copy(this.mouse);
        this.initialBoxPosition = this.trimBox.position.clone();
        this.renderer.domElement.style.cursor = 'grabbing';
        
        // 箱移動時の色変更（青色）
        this.setBoxMoveColors(true);
        
        this.disableOrbitControls();
        this.showTrimmingInfo();
    }

    setBoxMoveColors(isMoving) {
        if (!this.trimBox || !this.boxHelper) return;
        
        const color = isMoving ? 0x00dfff : this.boxColor; // 長押し移動時は #00b2ff に変更
        const opacity = isMoving ? 0.2 : this.boxOpacity; // 移動時は20%
        
        // 箱の面の色を変更
        if (this.trimBox.material) {
            this.trimBox.material.color.setHex(color);
            this.trimBox.material.opacity = opacity;
            
            // 移動時は深度テストを無効にして確実に最前面に表示
            if (isMoving) {
                this.trimBox.material.depthTest = false;  // 深度テスト無効
                this.trimBox.material.depthWrite = false; // 深度バッファ書き込み無効
            } else {
                this.trimBox.material.depthTest = true;   // 深度テスト復元
                this.trimBox.material.depthWrite = true;  // 深度バッファ書き込み復元
            }
            
            // マテリアルの更新を強制
            this.trimBox.material.needsUpdate = true;
        }
        
        // 箱の辺（エッジライン）の色を変更
        if (this.boxHelper.material) {
            this.boxHelper.material.color.setHex(color);
        }
        
        // 移動時のレンダリング順序を調整（最前面に表示）
        if (isMoving) {
            this.trimBox.renderOrder = 10001; // 非常に前面
            this.boxHelper.renderOrder = 10002; // エッジラインは常に最前面
        } else {
            this.trimBox.renderOrder = 0; // デフォルト
            this.boxHelper.renderOrder = 10000; // 常時最前面
        }
        
        console.log('箱移動色変更:', { 
            isMoving, 
            color: color.toString(16), 
            trimBoxRenderOrder: this.trimBox.renderOrder,
            boxHelperRenderOrder: this.boxHelper.renderOrder,
            depthTest: this.trimBox.material.depthTest,
            depthWrite: this.trimBox.material.depthWrite
        });
    }

    resetHandleColor(handle) {
        const userData = handle.userData;
        switch (userData.type) {
            case 'face':
                // 円錐（Mesh）の場合は直接material.colorを変更
                if (handle.material) {
                    handle.material.color.setHex(0xffffff);
                } else {
                    // Groupの子要素の色を白色に戻す（後方互換性）
                    handle.children.forEach(child => {
                        if (child.material) {
                            child.material.color.setHex(0xffffff);
                        }
                    });
                }
                break;
            case 'edge':
                // Groupの場合はOBJモデルまたはジオメトリベースの処理
                if (handle.type === 'Group') {
                    const enableHandle = handle.getObjectByName('enableHandle');
                    const activeHandle = handle.getObjectByName('activeHandle');
                    
                    if (enableHandle && activeHandle) {
                        // OBJモデルの場合：デフォルトモデルを表示、アクティブモデルを非表示
                        enableHandle.visible = true;
                        activeHandle.visible = false;
                        // デフォルトモデルの色を白色に戻す
                        enableHandle.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.color.setHex(0xffffff);
                            }
                        });
                    } else {
                        // ジオメトリベースの場合：色を戻す
                        handle.traverse((child) => {
                            if (child.isMesh && child.material) {
                                child.material.color.setHex(0xffffff);
                            }
                        });
                    }
                } else if (handle.material) {
                    handle.material.color.setHex(0xffffff); // 白色
                }
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
        const sensitivity = 0.2; // 面操作の感度を上げて反応性を向上
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
        // 辺操作：Y軸回転（感度を下げて精密操作を実現）
        const newRotation = this.initialBoxRotation + deltaX * 0.8;
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
        
        // 3D空間での移動ベクトルを計算
        const worldMovement = new THREE.Vector3();
        
        if (this.isCommandPressed) {
            // Commandキーが押されている場合：Z軸移動（前後）とX軸移動
            const cameraForward = new THREE.Vector3();
            camera.getWorldDirection(cameraForward);
            
            const worldDeltaX = (deltaX * sensitivity) * viewportWidth;
            const worldDeltaZ = (deltaY * sensitivity) * viewportHeight; // Y軸の移動をZ軸に変換
            
            worldMovement.addScaledVector(cameraRight, worldDeltaX);
            worldMovement.addScaledVector(cameraForward, worldDeltaZ);
            
            console.log('頂点Z軸移動:', { deltaX, deltaY, worldDeltaX, worldDeltaZ });
        } else {
            // 通常のXY軸移動
            const worldDeltaX = (deltaX * sensitivity) * viewportWidth;
            const worldDeltaY = (deltaY * sensitivity) * viewportHeight;
            
            worldMovement.addScaledVector(cameraRight, worldDeltaX);
            worldMovement.addScaledVector(cameraUp, worldDeltaY);
            
            console.log('頂点XY軸移動:', { deltaX, deltaY, worldDeltaX, worldDeltaY });
        }
        
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
            const offset = this.getArrowPlacementOffset(); // 箱から離す距離（基準オフセット補正済み）
            
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
            
            // インデックスベースの固定パターンで位置を決定
            // 配置パターン: [右奥{x:1,z:1}, 右手前{x:1,z:-1}, 左奥{x:-1,z:1}, 左手前{x:-1,z:-1}]
            const positionPatterns = [
                { x: 1, z: 1 },   // index 0: 右奥
                { x: 1, z: -1 },  // index 1: 右手前
                { x: -1, z: 1 },  // index 2: 左奥
                { x: -1, z: -1 }  // index 3: 左手前
            ];
            
            const pattern = positionPatterns[index % 4];
            const edgeX = pattern.x * boxSize.x;
            const edgeZ = pattern.z * boxSize.z;
            
            // 箱の高さ中央（Y=0）に配置
            const localPos = new THREE.Vector3(edgeX, 0, edgeZ);
            localPos.applyEuler(boxRotation);
            localPos.add(boxCenter);
            handle.position.copy(localPos);
            
            // デバッグ用ログ
            console.log('エッジハンドル位置更新:', { 
                index, 
                pattern,
                edgeX, edgeZ,
                finalPos: localPos.toArray()
            });
            
            // エッジハンドルの回転を設定（個別回転を適用）
            // インデックスベースの固定パターンで向きを決定
            // 角度パターン: [π/2, 0, π, -π/2] （右奥、右手前、左奥、左手前）
            const anglePatterns = [
                Math.PI / 2,  // index 0: 右奥の辺 - 円が右奥向き
                0,            // index 1: 右手前の辺 - 円が右手前向き
                Math.PI,      // index 2: 左奥の辺 - 円が左奥向き
                -Math.PI / 2  // index 3: 左手前の辺 - 円が左手前向き
            ];
            
            const baseAngleY = anglePatterns[index % 4];
            
            // ユーザー調整オフセットを適用（個別設定優先）
            const globalYOffsetRadians = (this.edgeRotationOffset || 0) * (Math.PI / 180);
            const individualYOffsetRadians = (this.individualEdgeYRotations[index] || 0) * (Math.PI / 180);
            const individualXOffsetRadians = (this.individualEdgeXRotations[index] || 0) * (Math.PI / 180);
            const individualZOffsetRadians = (this.individualEdgeZRotations[index] || 0) * (Math.PI / 180);
            
            // 基本角度 + グローバルオフセット + 個別オフセット
            const relativeRotationY = baseAngleY + globalYOffsetRadians + individualYOffsetRadians;
            const relativeRotationX = individualXOffsetRadians;
            const relativeRotationZ = individualZOffsetRadians;
            
            // 箱の回転と相対回転を合成
            const relativeRotation = new THREE.Euler(relativeRotationX, relativeRotationY, relativeRotationZ);
            const finalRotation = new THREE.Euler();
            finalRotation.setFromQuaternion(
                new THREE.Quaternion()
                    .setFromEuler(boxRotation)
                    .multiply(new THREE.Quaternion().setFromEuler(relativeRotation))
            );
            
            handle.rotation.copy(finalRotation);
        });
        
        // 回転軸の位置も更新
        this.rotationAxes.forEach((axis, index) => {
            if (index < this.edgeHandles.length) {
                axis.position.copy(this.edgeHandles[index].position);
            }
        });
        
        // 軸ハンドルの位置を更新
        if (this.axisHandles.length > 0) {
            // 追従するハンドルの位置を取得
            const basePosition = this.getFollowHandlePosition();
            if (!basePosition) {
                return; // ハンドルが見つからない場合はスキップ
            }
            
            const offsetY = boxSize.y + 0.5; // 箱の上面から0.5単位上に配置
            
            this.axisHandles.forEach((handle, index) => {
                const userData = handle.userData;
                if (!userData || userData.type !== 'axis') return;
                
                // 位置オフセットを取得
                const positionOffset = this.axisHandlePositions[userData.axis] || { x: 0, y: 0, z: 0 };
                
                // ローカル位置を計算
                const localPosition = new THREE.Vector3(
                    positionOffset.x,
                    offsetY + positionOffset.y,
                    positionOffset.z
                );
                
                // 箱の回転を考慮して位置を変換
                localPosition.applyEuler(boxRotation);
                localPosition.add(basePosition);
                handle.position.copy(localPosition);
                
                // 矢印の向きを更新
                handle.rotation.set(0, 0, 0);
                let axisDirection = new THREE.Vector3();
                switch (userData.axis) {
                    case 'x':
                        axisDirection.set(1, 0, 0);
                        break;
                    case 'y':
                        axisDirection.set(0, 1, 0);
                        break;
                    case 'z':
                        axisDirection.set(0, 0, 1);
                        break;
                }
                
                axisDirection.applyEuler(boxRotation);
                handle.lookAt(handle.position.clone().add(axisDirection));
                
                // arrow_corn_parallelMovementの向きを調整
                if (userData.axis === 'x') {
                    handle.rotateY(Math.PI / 2);
                } else if (userData.axis === 'z') {
                    handle.rotateX(-Math.PI / 2);
                }
                
                // 回転オフセットを適用
                const rotationOffset = this.axisHandleRotations[userData.axis];
                if (rotationOffset) {
                    handle.rotateX(rotationOffset.x * Math.PI / 180);
                    handle.rotateY(rotationOffset.y * Math.PI / 180);
                    handle.rotateZ(rotationOffset.z * Math.PI / 180);
                }
            });
        }
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
        
        // 軸制約が有効な場合
        if (this.activeAxis) {
            // 箱のローカル座標系での軸方向を取得
            const boxRotation = this.trimBox.rotation;
            let axisDirection = new THREE.Vector3();
            
            switch (this.activeAxis) {
                case 'x':
                    axisDirection.set(1, 0, 0);
                    break;
                case 'y':
                    axisDirection.set(0, 1, 0);
                    break;
                case 'z':
                    axisDirection.set(0, 0, 1);
                    break;
            }
            
            // 箱の回転を考慮してワールド座標系の軸方向に変換
            axisDirection.applyEuler(boxRotation);
            
            // カメラの右方向と上方向を軸方向に投影
            const rightProjection = cameraRight.dot(axisDirection);
            const upProjection = cameraUp.dot(axisDirection);
            
            // 投影された移動量を計算
            const axisMovement = (worldDeltaX * rightProjection + worldDeltaY * upProjection);
            
            // 軸方向のみに移動
            worldMovement.addScaledVector(axisDirection, axisMovement);
            
            console.log('軸制約移動:', {
                axis: this.activeAxis,
                axisDirection: axisDirection.toArray(),
                rightProjection,
                upProjection,
                axisMovement,
                worldMovement: worldMovement.toArray()
            });
        } else {
            // 自由移動（従来通り）
            worldMovement.addScaledVector(cameraRight, worldDeltaX);
            worldMovement.addScaledVector(cameraUp, worldDeltaY);
        }
        
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
            activeAxis: this.activeAxis,
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

    setIndividualEdgeZRotation(handleIndex, degrees) {
        if (handleIndex >= 0 && handleIndex < 4) {
            this.individualEdgeZRotations[handleIndex] = degrees;
            this.updateHandlePositions();
            // 初期回転も更新（向きを固定するため）
            this.updateInitialEdgeRotation(handleIndex);
            console.log(`エッジハンドル${handleIndex}のZ軸調整:`, { degrees });
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
            this.individualEdgeZRotations[handleIndex] = 0;
            this.updateHandlePositions();
            console.log(`エッジハンドル${handleIndex}向きリセット`);
            return { y: 0, x: 0, z: 0 };
        }
        return { 
            y: this.individualEdgeYRotations[handleIndex] || 0,
            x: this.individualEdgeXRotations[handleIndex] || 0,
            z: this.individualEdgeZRotations[handleIndex] || 0
        };
    }

    resetAllEdgeRotations() {
        this.edgeRotationOffset = 0;
        this.individualEdgeYRotations = [0, 0, 0, 0];
        this.individualEdgeXRotations = [0, 0, 0, 0];
        this.individualEdgeZRotations = [0, 0, 0, 0];
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

    getIndividualEdgeZRotation(handleIndex) {
        return this.individualEdgeZRotations[handleIndex] || 0;
    }

    setRotaryHandleScale(scale) {
        // スケールを更新（パーセンテージを実際のスケール値に変換、デフォルト0.1を基準）
        const baseScale = 0.1;
        this.rotaryHandleScale = baseScale * scale;
        
        // 既存のすべてのエッジハンドルのスケールを更新
        this.edgeHandles.forEach((handle) => {
            if (handle && handle.children) {
                handle.children.forEach((child) => {
                    if (child.name === 'enableHandle' || child.name === 'activeHandle') {
                        // OBJモデルベースのハンドル
                        child.scale.set(this.rotaryHandleScale, this.rotaryHandleScale, this.rotaryHandleScale);
                    } else if (child.isMesh && !child.name) {
                        // ジオメトリベースのハンドル（fallback）
                        child.scale.set(this.rotaryHandleScale / baseScale, this.rotaryHandleScale / baseScale, this.rotaryHandleScale / baseScale);
                    }
                });
            }
        });
        
        console.log(`回転ハンドルスケール更新: ${(scale * 100).toFixed(0)}% (実際の値: ${this.rotaryHandleScale.toFixed(3)})`);
    }

    setActiveHandlePositionOffset(x, y, z) {
        // アクティブハンドルの位置オフセットを設定
        this.activeHandlePositionOffset.set(x, y, z);
        
        // 既存のすべてのエッジハンドルのアクティブモデルの位置を更新
        this.edgeHandles.forEach((handle) => {
            if (handle && handle.children) {
                const activeHandle = handle.getObjectByName('activeHandle');
                if (activeHandle) {
                    activeHandle.position.copy(this.activeHandlePositionOffset);
                }
            }
        });
        
        console.log(`アクティブハンドル位置オフセット更新:`, this.activeHandlePositionOffset);
    }

    // 面のハイライトを表示する
    highlightFace(faceHandle) {
        if (!this.trimBox || !faceHandle) return;

        // 既存のハイライトをクリア
        this.clearFaceHighlight();

        const userData = faceHandle.userData;
        const axis = userData.axis;
        const direction = userData.direction;

        // 箱のサイズを取得
        const boxSize = new THREE.Vector3();
        this.trimBox.geometry.computeBoundingBox();
        const bbox = this.trimBox.geometry.boundingBox;
        boxSize.x = bbox.max.x - bbox.min.x;
        boxSize.y = bbox.max.y - bbox.min.y;
        boxSize.z = bbox.max.z - bbox.min.z;

        // ハイライト用の面ジオメトリを作成
        let geometry, position, rotation;
        const offset = 0.01; // 箱の面より少し外側に配置

        if (axis === 'x') {
            geometry = new THREE.PlaneGeometry(boxSize.z, boxSize.y);
            position = new THREE.Vector3(direction * (boxSize.x / 2 + offset), 0, 0);
            rotation = new THREE.Euler(0, direction > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        } else if (axis === 'y') {
            geometry = new THREE.PlaneGeometry(boxSize.x, boxSize.z);
            position = new THREE.Vector3(0, direction * (boxSize.y / 2 + offset), 0);
            rotation = new THREE.Euler(direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0);
        } else if (axis === 'z') {
            geometry = new THREE.PlaneGeometry(boxSize.x, boxSize.y);
            position = new THREE.Vector3(0, 0, direction * (boxSize.z / 2 + offset));
            rotation = new THREE.Euler(0, direction > 0 ? 0 : Math.PI, 0);
        }

        // ハイライト用のマテリアル（水色、半透明）
        const material = new THREE.MeshBasicMaterial({
            color: 0x00dfff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: false
        });

        // ハイライトメッシュを作成
        this.faceHighlight = new THREE.Mesh(geometry, material);
        this.faceHighlight.position.copy(position);
        this.faceHighlight.rotation.copy(rotation);
        this.faceHighlight.renderOrder = 999; // 最前面に表示

        // trimBoxの子として追加（箱と一緒に動くように）
        this.trimBox.add(this.faceHighlight);

        console.log('面ハイライト表示:', { axis, direction });

        // 対応する辺もハイライト表示
        this.highlightEdges(faceHandle);
    }

    // 面のハイライトを更新（箱のサイズ変更時に呼ばれる）
    updateFaceHighlight() {
        if (!this.faceHighlight || !this.activeHandle) return;

        const userData = this.activeHandle.userData;
        if (userData.type !== 'face') return;

        const axis = userData.axis;
        const direction = userData.direction;

        // 箱のサイズを取得
        const boxSize = new THREE.Vector3();
        this.trimBox.geometry.computeBoundingBox();
        const bbox = this.trimBox.geometry.boundingBox;
        boxSize.x = bbox.max.x - bbox.min.x;
        boxSize.y = bbox.max.y - bbox.min.y;
        boxSize.z = bbox.max.z - bbox.min.z;

        // ハイライト用の面ジオメトリを作成
        let geometry, position, rotation;
        const offset = 0.01; // 箱の面より少し外側に配置

        if (axis === 'x') {
            geometry = new THREE.PlaneGeometry(boxSize.z, boxSize.y);
            position = new THREE.Vector3(direction * (boxSize.x / 2 + offset), 0, 0);
            rotation = new THREE.Euler(0, direction > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
        } else if (axis === 'y') {
            geometry = new THREE.PlaneGeometry(boxSize.x, boxSize.z);
            position = new THREE.Vector3(0, direction * (boxSize.y / 2 + offset), 0);
            rotation = new THREE.Euler(direction > 0 ? Math.PI / 2 : -Math.PI / 2, 0, 0);
        } else if (axis === 'z') {
            geometry = new THREE.PlaneGeometry(boxSize.x, boxSize.y);
            position = new THREE.Vector3(0, 0, direction * (boxSize.z / 2 + offset));
            rotation = new THREE.Euler(0, direction > 0 ? 0 : Math.PI, 0);
        }

        // 既存のジオメトリを破棄して新しいものに置き換え
        this.faceHighlight.geometry.dispose();
        this.faceHighlight.geometry = geometry;
        this.faceHighlight.position.copy(position);
        this.faceHighlight.rotation.copy(rotation);

        // 辺ハイライトも更新
        this.highlightEdges(this.activeHandle);
    }

    // 辺をハイライト表示する
    highlightEdges(faceHandle) {
        if (!this.trimBox || !faceHandle) return;

        // 既存の辺ハイライトをクリア
        this.clearEdgeHighlights();

        const userData = faceHandle.userData;
        const axis = userData.axis;
        const direction = userData.direction;

        // 箱のサイズを取得
        const boxSize = new THREE.Vector3();
        this.trimBox.geometry.computeBoundingBox();
        const bbox = this.trimBox.geometry.boundingBox;
        boxSize.x = bbox.max.x - bbox.min.x;
        boxSize.y = bbox.max.y - bbox.min.y;
        boxSize.z = bbox.max.z - bbox.min.z;

        const halfX = boxSize.x / 2;
        const halfY = boxSize.y / 2;
        const halfZ = boxSize.z / 2;

        // 面の4つの辺の座標を計算
        let edgeLines = [];

        if (axis === 'x') {
            // X軸の面（4本の辺）
            const x = direction * halfX;
            edgeLines = [
                [new THREE.Vector3(x, -halfY, -halfZ), new THREE.Vector3(x, halfY, -halfZ)],
                [new THREE.Vector3(x, halfY, -halfZ), new THREE.Vector3(x, halfY, halfZ)],
                [new THREE.Vector3(x, halfY, halfZ), new THREE.Vector3(x, -halfY, halfZ)],
                [new THREE.Vector3(x, -halfY, halfZ), new THREE.Vector3(x, -halfY, -halfZ)]
            ];
        } else if (axis === 'y') {
            // Y軸の面（4本の辺）
            const y = direction * halfY;
            edgeLines = [
                [new THREE.Vector3(-halfX, y, -halfZ), new THREE.Vector3(halfX, y, -halfZ)],
                [new THREE.Vector3(halfX, y, -halfZ), new THREE.Vector3(halfX, y, halfZ)],
                [new THREE.Vector3(halfX, y, halfZ), new THREE.Vector3(-halfX, y, halfZ)],
                [new THREE.Vector3(-halfX, y, halfZ), new THREE.Vector3(-halfX, y, -halfZ)]
            ];
        } else if (axis === 'z') {
            // Z軸の面（4本の辺）
            const z = direction * halfZ;
            edgeLines = [
                [new THREE.Vector3(-halfX, -halfY, z), new THREE.Vector3(halfX, -halfY, z)],
                [new THREE.Vector3(halfX, -halfY, z), new THREE.Vector3(halfX, halfY, z)],
                [new THREE.Vector3(halfX, halfY, z), new THREE.Vector3(-halfX, halfY, z)],
                [new THREE.Vector3(-halfX, halfY, z), new THREE.Vector3(-halfX, -halfY, z)]
            ];
        }

        // 各辺をハイライト表示
        edgeLines.forEach(([start, end]) => {
            // ローカル座標からワールド座標に変換
            const worldStart = start.clone().applyMatrix4(this.trimBox.matrixWorld);
            const worldEnd = end.clone().applyMatrix4(this.trimBox.matrixWorld);

            const geometry = new THREE.BufferGeometry().setFromPoints([worldStart, worldEnd]);
            const material = new THREE.LineBasicMaterial({
                color: 0x00dfff,
                linewidth: 4,
                depthTest: false,
                transparent: true,
                opacity: 1.0
            });
            const line = new THREE.Line(geometry, material);
            line.renderOrder = 10003; // boxHelperよりも前面に表示（boxHelperは10002）

            // シーンに直接追加（trimBoxの子ではなく）
            this.scene.add(line);
            this.edgeHighlights.push(line);
        });

        console.log('辺ハイライト表示:', { axis, direction, edgeCount: this.edgeHighlights.length });
    }

    // 辺のハイライトをクリア
    clearEdgeHighlights() {
        this.edgeHighlights.forEach(line => {
            // シーンから削除
            this.scene.remove(line);
            line.geometry.dispose();
            line.material.dispose();
        });
        this.edgeHighlights = [];
    }

    // 面のハイライトをクリア
    clearFaceHighlight() {
        if (this.faceHighlight) {
            if (this.faceHighlight.parent) {
                this.faceHighlight.parent.remove(this.faceHighlight);
            }
            this.faceHighlight.geometry.dispose();
            this.faceHighlight.material.dispose();
            this.faceHighlight = null;
            console.log('面ハイライトクリア');
        }
    }

    clear() {
        console.log('=== TrimBoxManipulator.clear() 開始 ===');

        // クリア時にカメラコントロールを再有効化
        this.enableOrbitControls();

        // 面ハイライトをクリア
        this.clearFaceHighlight();

        // 辺ハイライトをクリア
        this.clearEdgeHighlights();

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
        [...this.handles, ...this.faceHandles, ...this.edgeHandles, ...this.cornerHandles, ...this.axisHandles].forEach(handle => {
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
        this.axisHandles = [];
        this.rotationAxes = [];
        this.initialEdgeRotations = []; // 初期回転もクリア
        this.activeHandle = null; // アクティブなハンドルをクリア
        this.hoveredHandle = null; // ホバー中のハンドルをクリア
        this.hoveredFaceHandle = null; // ホバー中の面ハンドルをクリア
        this.activeAxis = null; // 軸制約をクリア
        
        console.log('=== TrimBoxManipulator.clear() 完了 ===');
        
        // クリア後のシーンをデバッグ
        this.debugScene();
    }

    debugScene() {
        console.log('=== シーン内オブジェクト一覧 ===');
        this.scene.children.forEach((child, idx) => {
            const color = child.material?.color?.getHex();
            const colorStr = color ? `0x${color.toString(16).padStart(6, '0')}` : 'N/A';
            console.log(`${idx}: ${child.type} | name="${child.name}" | color=${colorStr} | visible=${child.visible}`);
            
            // 黄色系のオブジェクトを特定
            if (color && (color === 0x00dfff)) {
                console.warn(`⚠️ 活性色オブジェクト発見: ${child.type} | userData=`, child.userData);
            }
        });
        console.log('===========================');
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
        
        // 現在の状態を保存
        const currentRotation = preserveRotation ? this.trimBox.rotation.clone() : new THREE.Euler();
        const currentColor = this.trimBox.material.color.getHex();
        const currentOpacity = this.trimBox.material.opacity;
        const currentDepthTest = this.trimBox.material.depthTest;
        const currentDepthWrite = this.trimBox.material.depthWrite;
        const currentTrimBoxRenderOrder = this.trimBox.renderOrder;
        const currentBoxHelperRenderOrder = this.boxHelper.renderOrder;
        const currentBoxHelperColor = this.boxHelper.material.color.getHex();
        
        // 箱のサイズを更新
        this.scene.remove(this.trimBox);
        this.scene.remove(this.boxHelper);
        this.trimBox.geometry.dispose();
        this.boxHelper.geometry.dispose();
        
        const geometry = new THREE.BoxGeometry(newSize.x, newSize.y, newSize.z);
        this.trimBox.geometry = geometry;
        this.trimBox.position.copy(center);
        this.trimBox.rotation.copy(currentRotation); // 回転を復元
        // 色、不透明度、深度設定、レンダリング順序を復元
        this.trimBox.material.color.setHex(currentColor);
        this.trimBox.material.opacity = currentOpacity;
        this.trimBox.material.depthTest = currentDepthTest;
        this.trimBox.material.depthWrite = currentDepthWrite;
        this.trimBox.material.needsUpdate = true; // マテリアル更新を強制
        this.trimBox.renderOrder = currentTrimBoxRenderOrder;
        this.scene.add(this.trimBox);
        
        const edges = new THREE.EdgesGeometry(geometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: currentBoxHelperColor, // 保存した色を使用
            linewidth: 2,
            depthTest: false,  // 深度テストを無効にして常に最前面に表示
            depthWrite: false, // 深度バッファに書き込まない
            transparent: true  // 透明度設定を有効にする
        });
        this.boxHelper = new THREE.LineSegments(edges, lineMaterial);
        this.boxHelper.position.copy(center);
        this.boxHelper.rotation.copy(currentRotation); // 回転を復元
        this.boxHelper.renderOrder = currentBoxHelperRenderOrder; // 保存したレンダリング順序を復元
        this.scene.add(this.boxHelper);
        
        // 位置を更新
        this.targetPosition.copy(center);
        
        // 現在の状態を保存（次回の操作で使用）
        this.currentBoxBounds = new THREE.Box3().setFromObject(this.trimBox);

        this.updateHandlePositions();

        // 面ハイライトが表示されている場合は更新
        this.updateFaceHighlight();
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

    // 円錐サイズ変更メソッド
    setArrowOffset(offset) {
        this.arrowOffset = offset;
        this.updateArrowSizes();
    }

    setConeRadius(radius) {
        this.coneRadius = radius;
        this.updateArrowSizes();
    }

    setConeHeight(height) {
        this.coneHeight = height;
        this.updateArrowSizes();
    }

    setCustomArrowScale(scale) {
        this.customArrowScale = Math.max(0.01, Math.min(0.2, scale));
        this.updateArrowSizes(); // 矢印を再作成
        console.log('カスタム矢印スケール設定:', this.customArrowScale);
    }

    setArrowType(type) {
        if (type !== 'arrow' && type !== 'arrow_corn') {
            console.error('無効な矢印タイプ:', type);
            return;
        }
        this.arrowType = type;
        this.updateArrowSizes(); // 矢印を再作成
        console.log('矢印タイプ変更:', this.arrowType);
    }

    setArrowCornRotation(faceKey, axis, degrees) {
        // faceKey: 'x+', 'x-', 'y+', 'y-', 'z+', 'z-'
        // axis: 'x', 'y', 'z'
        // degrees: 回転角度（度単位、90度刻み）
        if (!this.arrowCornRotations[faceKey]) {
            console.error('無効な面キー:', faceKey);
            return;
        }
        if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
            console.error('無効な軸:', axis);
            return;
        }
        
        // 90度刻みに制限
        const normalizedDegrees = Math.round(degrees / 90) * 90;
        this.arrowCornRotations[faceKey][axis] = normalizedDegrees;
        
        // すべての面ハンドルの向きを更新（visible/invisible問わず）
        this.faceHandles.forEach(handle => {
            if (handle && handle.userData) {
                this.orientArrowHandle(handle, handle.userData);
            }
        });
        
        console.log('arrow_corn回転設定:', faceKey, axis, normalizedDegrees);
    }

    setAxisHandleRotation(axis, rotationAxis, degrees) {
        // 平行移動の矢印の回転オフセットを設定（度単位）
        // axis: 'x', 'y', 'z'（どの軸の矢印か）
        // rotationAxis: 'x', 'y', 'z'（どの軸で回転するか）
        // degrees: 回転角度（度単位）
        
        if (!this.axisHandleRotations[axis]) {
            this.axisHandleRotations[axis] = { x: 0, y: 0, z: 0 };
        }
        
        if (rotationAxis !== 'x' && rotationAxis !== 'y' && rotationAxis !== 'z') {
            console.error('無効な回転軸:', rotationAxis);
            return;
        }
        
        // 角度を-180～180度の範囲に正規化
        let normalizedDegrees = degrees % 360;
        if (normalizedDegrees > 180) {
            normalizedDegrees -= 360;
        } else if (normalizedDegrees < -180) {
            normalizedDegrees += 360;
        }
        
        this.axisHandleRotations[axis][rotationAxis] = normalizedDegrees;
        
        // 既存の軸ハンドルに回転を適用（再作成）
        if (this.trimBox) {
            this.createAxisHandles();
            this.updateHandlePositions();
        }
        
        console.log('軸ハンドル回転設定:', axis, rotationAxis, normalizedDegrees);
    }

    setFollowHandle(type, index) {
        // 平行移動の矢印が追従するハンドルを設定
        // type: 'edge' または 'corner'
        // index: エッジハンドルの場合0-3、頂点ハンドルの場合corner名（例: 'max-max-max'）
        
        if (type !== 'edge' && type !== 'corner') {
            console.error('無効なハンドルタイプ:', type);
            return;
        }
        
        this.followHandleType = type;
        this.followHandleIndex = index;
        
        // 既存の軸ハンドルを再作成して位置を更新
        if (this.trimBox) {
            this.createAxisHandles();
            this.updateHandlePositions();
        }
        
        console.log('追従ハンドル設定:', type, index);
    }

    setAxisHandlePosition(axis, positionAxis, value) {
        // 平行移動の矢印の位置オフセットを設定
        // axis: 'x', 'y', 'z'（どの軸の矢印か）
        // positionAxis: 'x', 'y', 'z'（どの方向に移動するか）
        // value: 位置オフセット値
        
        if (!this.axisHandlePositions[axis]) {
            this.axisHandlePositions[axis] = { x: 0, y: 0, z: 0 };
        }
        
        if (positionAxis !== 'x' && positionAxis !== 'y' && positionAxis !== 'z') {
            console.error('無効な位置軸:', positionAxis);
            return;
        }
        
        this.axisHandlePositions[axis][positionAxis] = value;
        
        // 既存の軸ハンドルの位置を更新
        if (this.trimBox) {
            this.updateHandlePositions();
        }
        
        console.log('軸ハンドル位置設定:', axis, positionAxis, value);
    }

    updateAxisHandleAppearance() {
        // 平行移動の矢印の見た目を更新（選択状態とホバー状態に応じて色と透明度を変更）
        this.axisHandles.forEach(handle => {
            if (!handle || !handle.userData || handle.userData.type !== 'axis') return;
            
            const isSelected = this.activeAxis === handle.userData.axis;
            const isHovered = this.hoveredAxisHandle === handle;
            const selectedColor = 0x00dfff; // 面選択時の矢印と同じ水色
            
            // arrowGroupの子要素から矢印メッシュを探す
            handle.traverse((child) => {
                if (child.isMesh && child.material && !child.userData.isAxisHandleClickable) {
                    // クリック可能領域ではないメッシュのみ更新
                    if (isSelected) {
                        // 選択時：水色（面選択時の矢印と同じ色）、不透明度100%
                        child.material.color.setHex(selectedColor);
                        child.material.opacity = 1.0;
                    } else if (isHovered) {
                        // ホバー時：白、不透明度100%
                        child.material.color.setHex(0xffffff);
                        child.material.opacity = 1.0;
                    } else {
                        // 非選択時：白、透明度30%
                        child.material.color.setHex(0xffffff);
                        child.material.opacity = 0.3;
                    }
                    child.material.transparent = true;
                    child.material.needsUpdate = true;
                }
            });
        });
    }

    setArrowCornPositionOffset(offset) {
        // arrow_corn専用の位置オフセットを設定（すべての矢印を同じ距離だけ外側に移動）
        this.arrowCornPositionOffset = offset;
        
        // 矢印の位置を更新
        this.updateHandlePositions();
        
        console.log('arrow_corn位置オフセット設定:', offset);
    }

    setArrowCornClickableMargin(axis, margin) {
        // arrow_corn専用のクリック可能領域のマージンを設定（各軸ごと）
        // axis: 'x', 'y', 'z'
        // margin: 0～10.0の範囲
        if (axis !== 'x' && axis !== 'y' && axis !== 'z') {
            console.error('無効な軸:', axis);
            return;
        }
        
        this.arrowCornClickableMargin[axis] = Math.max(0, Math.min(10.0, margin)); // 0～10.0の範囲に制限
        
        // すべてのarrow_corn矢印のクリック可能領域を再作成
        if (this.arrowType === 'arrow_corn' && this.trimBox) {
            this.updateArrowSizes();
        }
        
        console.log('arrow_cornクリック可能領域マージン設定:', axis, this.arrowCornClickableMargin[axis]);
    }

    setArrowCornClickableVisible(visible) {
        // arrow_corn専用のクリック可能領域の表示状態を設定
        this.arrowCornClickableVisible = visible;
        
        // すべてのarrow_corn矢印のクリック可能領域の表示状態を更新
        this.faceHandles.forEach(handle => {
            if (handle && handle.children) {
                handle.children.forEach(child => {
                    if (child.userData && child.userData.isArrowCornClickable && child.material) {
                        child.material.opacity = visible ? 0.5 : 0;
                        child.material.needsUpdate = true;
                    }
                });
            }
        });
        
        console.log('arrow_cornクリック可能領域表示状態:', visible);
    }

    getArrowPlacementOffset() {
        const pivotCompensation = (this.customArrowBoundingBox && this.customArrowLoaded)
            ? this.customArrowPivotOffset * this.customArrowScale
            : 0;
        let offset = this.arrowOffset - pivotCompensation;
        
        // arrow_cornの場合、追加の位置オフセットを適用
        if (this.arrowType === 'arrow_corn') {
            offset += this.arrowCornPositionOffset;
        }
        
        return offset;
    }
    
    setZArrowRotationEnabled(enabled) {
        this.zArrowRotationEnabled = enabled;
        console.log('Z軸矢印回転:', this.zArrowRotationEnabled);
    }
    
    setZArrowRotationAxis(axis) {
        this.zArrowRotationAxis = axis;
        console.log('Z軸矢印回転軸:', this.zArrowRotationAxis);
    }

    isCustomArrowAvailable() {
        return this.customArrowLoaded;
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
            // 既存の選択状態（axis/direction）を保存
            const selectedInfo = this.selectedFace && this.selectedFace.userData ? {
                axis: this.selectedFace.userData.axis,
                direction: this.selectedFace.userData.direction
            } : null;
            const box = new THREE.Box3().setFromObject(this.trimBox);
            const min = box.min;
            const max = box.max;
            const center = box.getCenter(new THREE.Vector3());

            // 面ハンドル（6つの面）- 箱の外側に少し出して配置
            const offset = this.getArrowPlacementOffset(); // 箱から離す距離（動的設定、矢印の基準オフセットを補正）
            const facePositions = [
                { pos: new THREE.Vector3(max.x + offset, center.y, center.z), type: 'face', axis: 'x', direction: 1 },
                { pos: new THREE.Vector3(min.x - offset, center.y, center.z), type: 'face', axis: 'x', direction: -1 },
                { pos: new THREE.Vector3(center.x, max.y + offset, center.z), type: 'face', axis: 'y', direction: 1 },
                { pos: new THREE.Vector3(center.x, min.y - offset, center.z), type: 'face', axis: 'y', direction: -1 },
                { pos: new THREE.Vector3(center.x, center.y, max.z + offset), type: 'face', axis: 'z', direction: 1 },
                { pos: new THREE.Vector3(center.x, center.y, min.z - offset), type: 'face', axis: 'z', direction: -1 }
            ];

            // 面ハンドルを作成（選択されているもののみ可視）
            facePositions.forEach(handleData => {
                // 新しい矢印Groupを作成（面データを渡す）
                const handle = this.createArrowGeometry(handleData);
                handle.position.copy(handleData.pos);
                handle.userData = handleData;
                // 選択情報と一致するもののみ表示
                handle.visible = selectedInfo ? (handleData.axis === selectedInfo.axis && handleData.direction === selectedInfo.direction) : false;
                
                // 矢印を面の法線方向に向ける
                this.orientArrowHandle(handle, handleData);
                
                this.scene.add(handle);
                this.handles.push(handle);
                this.faceHandles.push(handle);

                // 新しく生成したハンドルに選択を張り替え
                if (selectedInfo && handle.visible) {
                    this.selectedFace = handle;
                }
            });

            console.log('円錐サイズ更新完了:', {
                arrowOffset: this.arrowOffset,
                placementOffset: offset,
                coneRadius: this.coneRadius,
                coneHeight: this.coneHeight,
                faceHandleCount: this.faceHandles.length
            });
        }
    }

    updateHandleScales() {
        // トリミングボックスが存在しない場合は何もしない
        if (!this.trimBox) return;

        // カメラからトリミングボックス中心までの距離を計算
        const boxCenter = this.trimBox.position.clone();
        const cameraDistance = this.camera.position.distanceTo(boxCenter);

        // 基準距離（初期状態のカメラ距離）
        const referenceDistance = 10.0; // 初期状態での距離を基準とする

        // 距離に応じたスケール係数を計算
        const scaleFactor = cameraDistance / referenceDistance;

        // 面ハンドル（矢印）のスケールを更新
        this.faceHandles.forEach(handle => {
            if (handle && handle.visible) {
                handle.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
        });

        // エッジハンドル（回転ハンドル）のスケールを更新
        this.edgeHandles.forEach(handle => {
            if (handle) {
                handle.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
        });

        // 頂点ハンドルのスケールを更新
        this.cornerHandles.forEach(handle => {
            if (handle) {
                handle.scale.set(scaleFactor, scaleFactor, scaleFactor);
            }
        });
    }
}

export { TrimBoxManipulator };
