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
            const response = await fetch('./Scaniverse 2024-07-21 155128.ply');
            if (!response.ok) {
                console.warn('デフォルトPLYファイルが見つかりません - 初期状態で待機します');
                // ボタンを無効のままにする（モデルがない状態）
                return;
            }
            
            const arrayBuffer = await response.arrayBuffer();
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                console.error('デフォルトPLYファイルが空です');
                return;
            }
            
            const tab = this.createTab('デフォルト', './Scaniverse 2024-07-21 155128.ply', true);
            
            // PLYファイルを読み込み
            await this.plyViewer.loadPLYFromArrayBuffer(arrayBuffer, tab.id);
            
            // モデルが正常に読み込まれたか確認
            if (!this.plyViewer.currentModel) {
                console.error('デフォルトモデルの作成に失敗しました');
                return;
            }
            
            // デフォルトモデルの向きを設定（等角 + x軸-90度）
            await this.setDefaultOrientation(tab.id);
            
            console.log('デフォルトPLYファイルを読み込みました');
        } catch (error) {
            console.error('デフォルトPLYファイルの読み込みエラー:', error);
            // エラー時は何も表示せず、ボタンを無効のままにする
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

export { TabManager };
