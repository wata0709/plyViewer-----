# TrimBoxManipulator - 3Dスライス用箱型マニピュレーター

PLYファイルの3Dポイントクラウドをスライス（トリミング）するための高度な箱型マニピュレーターシステムです。直感的な操作でXYZ軸での精密な範囲設定が可能です。

## 概要

`TrimBoxManipulator`は、Three.jsベースの3Dビューワーで使用される、インタラクティブなトリムボックス操作システムです。複数のハンドルタイプと操作モードを提供し、ユーザーが3D空間内で直感的にスライス範囲を設定できるようにします。

## 主要機能

### 1. トリムボックス
- **半透明の箱**: スライス範囲を視覚的に表示（デフォルト透明度10%）
- **エッジライン**: 箱の境界を明確に表示
- **動的サイズ調整**: ハンドル操作でリアルタイムにサイズ変更
- **回転対応**: 箱全体を回転させて任意の向きでスライス可能

### 2. ハンドルシステム

#### 面ハンドル（6個）
- **機能**: 単一軸方向への移動
- **配置**: 各面（X+, X-, Y+, Y-, Z+, Z-）の中央
- **操作**: ドラッグで対面を固定基点として面を移動
- **視覚**: カスタムOBJモデル（`arrow.obj`または`arrow_corn.obj`）を使用
- **特徴**:
  - ホバー時に色が変化（シアン: `0x00dfff`）
  - 選択時にアクティブ状態を表示
  - Z軸矢印はカメラ方向に自動回転（オプション）

#### エッジハンドル（4個）
- **機能**: 二軸同時移動と回転操作
- **配置**: 水平エッジ（XZ平面）の4箇所
- **操作**:
  - **通常ドラッグ**: Y軸とXZ平面内での移動
  - **回転ハンドル操作**: 箱全体の回転（回転ハンドルをドラッグ）
- **視覚**: 1/4円のチューブジオメトリと回転ハンドル（`rotaryHandleEnable.obj`/`rotaryHandleActive.obj`）
- **特徴**:
  - 回転ハンドルはエッジハンドルに付属
  - アクティブ時は`rotaryHandleActive`モデルに切り替え
  - ホバー時にチューブがシアン色に変化

#### 頂点ハンドル（8個）
- **機能**: 三軸同時移動（対角基点変形）
- **配置**: 箱の8つの頂点
- **操作**: ドラッグで対角の頂点を固定基点として箱を変形
- **視覚**: 小さな球体ジオメトリ
- **特徴**: 最も自由度の高い操作が可能

#### 軸制約移動ハンドル（3個）
- **機能**: 特定の軸方向のみへの移動を制約
- **配置**: 追従するハンドル（エッジまたは頂点）の近く
- **操作**: クリックで軸制約モードを有効化、箱全体を移動
- **視覚**: カスタムOBJモデル（`arrow_corn_parallelMovement.obj`）
- **軸**: X軸、Y軸、Z軸の3つ
- **特徴**:
  - Command/Ctrlキーと組み合わせて使用
  - 軸制約が有効な間、箱は指定軸方向のみに移動
  - 各軸ごとに位置オフセットと回転オフセットを設定可能

### 3. 操作モード

#### 面選択モード
- **長押し検出**: 面を200ms以上長押しで面選択モードに移行
- **面ハイライト**: 選択された面を視覚的に強調表示
- **エッジハイライト**: 選択面のエッジをラインで表示

#### 軸制約モード
- **有効化**: 軸ハンドルをクリック、またはCommand/Ctrlキーを押しながら操作
- **動作**: 箱全体の移動が指定軸方向のみに制限される
- **視覚フィードバック**: アクティブな軸ハンドルが強調表示

#### 回転モード
- **有効化**: エッジハンドルの回転ハンドルをドラッグ
- **動作**: 箱全体が回転軸を中心に回転
- **初期回転保存**: エッジハンドルの初期回転を保存し、箱の回転に追従

### 4. インタラクション機能

#### ホバー効果
- **面ハンドル**: ホバー時にシアン色（`0x00dfff`）に変化
- **エッジハンドル**: チューブ部分がシアン色に変化
- **回転ハンドル**: アクティブ状態のモデルに切り替え
- **軸ハンドル**: ホバー時に強調表示

#### ドラッグ操作
- **マウスダウン**: ハンドルまたは箱をクリック
- **マウス移動**: ドラッグ中にリアルタイムで箱を更新
- **マウスアップ**: 操作を確定

#### キーボード操作
- **Escapeキー**: ドラッグ操作をキャンセル
- **Command/Ctrlキー**: 軸制約モードの有効化

### 5. カスタムモデル読み込み

マニピュレーターは以下のOBJモデルを使用します：

- **`arrow.obj`**: 標準の面ハンドル矢印
- **`arrow_corn.obj`**: コーナー型の面ハンドル矢印
- **`arrow_corn_parallelMovement.obj`**: 軸制約移動用の矢印
- **`rotaryHandleEnable.obj`**: デフォルト状態の回転ハンドル
- **`rotaryHandleActive.obj`**: アクティブ状態の回転ハンドル

すべてのモデルは非同期で読み込まれ、読み込み完了後にハンドルが作成されます。

## 技術仕様

### クラス構造

```javascript
class TrimBoxManipulator {
    constructor(scene, camera, renderer, controls, getCurrentModel)
}
```

### 主要メソッド

#### 初期化・作成
- `create(boundingBox, useFullRange)`: トリムボックスとハンドルを作成
- `createHandles()`: すべてのハンドルを生成
- `createAxisHandles()`: 軸制約移動用ハンドルを生成
- `loadCustomArrowModel()`: カスタム矢印モデルを読み込み
- `loadRotaryHandleModels()`: 回転ハンドルモデルを読み込み

#### 更新・操作
- `updateBoxFromHandle(deltaX, deltaY)`: ハンドル操作に基づいて箱を更新
- `updateFaceSize(userData, deltaX, deltaY)`: 面ハンドルによるサイズ変更
- `updateBoxRotation(deltaX)`: エッジハンドルによる回転
- `updateCornerPosition(userData, deltaX, deltaY)`: 頂点ハンドルによる変形
- `updateBoxPosition(deltaX, deltaY)`: 箱全体の移動
- `updateHandlePositions()`: 箱の変更に応じてハンドル位置を更新

#### イベント処理
- `setupEventListeners()`: マウス・キーボードイベントを設定
- `onMouseDown(event)`: マウスダウン処理
- `onMouseMove(event)`: マウス移動処理
- `onMouseUp(event)`: マウスアップ処理

#### 表示制御
- `show()`: マニピュレーターを表示
- `hide()`: マニピュレーターを非表示
- `enableOrbitControls()`: カメラコントロールを有効化
- `disableOrbitControls()`: カメラコントロールを無効化

#### 情報取得
- `getBoundingBox()`: 現在のトリムボックスの境界ボックスを取得
- `getFollowHandlePosition()`: 追従するハンドルの位置を取得

### 設定パラメータ

#### 視覚設定
- `boxColor`: 箱の色（デフォルト: `0xffffff`）
- `boxOpacity`: 箱の透明度（デフォルト: `0.1`）
- `arrowOffset`: 矢印の引き出し線の長さ（デフォルト: `0.75`）
- `customArrowScale`: カスタム矢印のスケール（デフォルト: `0.150`）
- `rotaryHandleScale`: 回転ハンドルのスケール（デフォルト: `0.05`）

#### 操作設定
- `longPressDuration`: 長押し検出時間（デフォルト: `200ms`）
- `rotaryHandleHitboxRadius`: 回転ハンドルの当たり判定半径（デフォルト: `0.15`）
- `zArrowRotationEnabled`: Z軸矢印のカメラ追従（デフォルト: `true`）

#### 位置・回転オフセット
- `axisHandlePositions`: 各軸ハンドルの位置オフセット
- `axisHandleRotations`: 各軸ハンドルの回転オフセット
- `arrowCornRotations`: arrow_cornモデルの回転オフセット
- `arrowCornPositionOffset`: arrow_cornモデルの位置オフセット

## 使用方法

### 基本的な使用例

```javascript
import TrimBoxManipulator from './js/TrimBoxManipulator.js';

// マニピュレーターのインスタンス作成
const manipulator = new TrimBoxManipulator(
    scene,      // THREE.Scene
    camera,     // THREE.PerspectiveCamera
    renderer,   // THREE.WebGLRenderer
    controls,   // OrbitControls
    getCurrentModel  // 現在のモデルを取得する関数
);

// モデルの境界ボックスからトリムボックスを作成
const boundingBox = new THREE.Box3().setFromObject(model);
manipulator.create(boundingBox);

// スライス範囲を取得
const trimBox = manipulator.getBoundingBox();
```

### 操作手順

1. **スライスモード開始**
   - アプリケーションの「スライス」ボタンをクリック
   - マニピュレーターが自動的に表示される

2. **範囲調整**
   - **面ハンドル**: 単一方向にドラッグして範囲を拡張/縮小
   - **エッジハンドル**: 二軸方向にドラッグして範囲を調整
   - **頂点ハンドル**: 三軸方向にドラッグして対角変形
   - **回転ハンドル**: エッジハンドル上の回転ハンドルをドラッグして箱を回転

3. **軸制約移動**
   - X/Y/Z軸ハンドルをクリックして軸制約モードを有効化
   - 箱全体をドラッグして指定軸方向のみに移動
   - Command/Ctrlキーを押しながら操作することも可能

4. **スライス実行**
   - 「完了する」ボタンでスライス範囲を確定
   - 範囲外のポイントが除去される

## ファイル構成

```
Slice/
├── js/
│   └── TrimBoxManipulator.js  # マニピュレータークラス（3713行）
├── OBJ/
│   ├── arrow.obj                          # 標準面ハンドル矢印
│   ├── arrow_corn.obj                    # コーナー型面ハンドル矢印
│   ├── arrow_corn_parallelMovement.obj   # 軸制約移動用矢印
│   ├── rotaryHandleEnable.obj            # デフォルト回転ハンドル
│   └── rotaryHandleActive.obj            # アクティブ回転ハンドル
└── README.md                              # このファイル
```

## 依存関係

- **Three.js r160以上**: 3Dレンダリングとジオメトリ操作
- **OBJLoader**: カスタムOBJモデルの読み込み

## ブラウザ対応

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

WebGL 2.0対応が必要です。

## 注意事項

- マニピュレーター操作中はカメラコントロールが自動的に無効化されます
- 大容量のポイントクラウドでは、ハンドルのレンダリングが重くなる可能性があります
- カスタムOBJモデルの読み込みが完了するまで、一部のハンドルが表示されない場合があります
- 回転操作はエッジハンドルでのみ可能です（面ハンドルや頂点ハンドルでは回転不可）

## 開発者向け情報

### カスタマイズ

マニピュレーターの動作は、コンストラクタ内の各種パラメータで調整可能です：

- 色・透明度: `boxColor`, `boxOpacity`
- サイズ: `arrowOffset`, `customArrowScale`, `rotaryHandleScale`
- 操作感度: `longPressDuration`, `rotaryHandleHitboxRadius`
- 位置・回転: `axisHandlePositions`, `axisHandleRotations`

### デバッグ

コンソールログが多数出力されるため、開発時はブラウザの開発者ツールで確認できます：
- ハンドル操作の詳細
- 箱の更新処理
- イベント処理の流れ

## ライセンス

このプロジェクトのライセンス情報は、プロジェクトルートのLICENSEファイルを参照してください。
