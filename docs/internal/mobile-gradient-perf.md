# 行動裝置漸層與畫面效能研究

日期：2026-10-07（Asia/Taipei）。範圍：只讀研究，沒有改任何程式碼，沒有 commit。

維護者的問題是「查 gradient 演算法，分析目前專案的效能最佳實踐，讓行動裝置更順、畫質更高」。這裡把 gradient 解讀為渲染意義：漸層如何在行動 GPU 與螢幕上產生並顯示得好（色帶、抖色、漸層噪聲、色彩空間、位元深度、抗鋸齒）。

**關於「gradient descent」。** 梯度下降（gradient descent，機器學習的最佳化法）與本專案的渲染無關：場景沒有訓練或擬合任何參數，所以不在本文範圍。已考慮過，確認不相關。

## 0. 結論先行

1. 手機上 3D 場景的漸層其實很少。手機（`compact`）關閉光柱、塵埃、星雲、桌面光暈，天空是單色 `#050e15`，所以手機的色帶風險主要在 DOM 的 CSS 漸層（Chromium 已自動抖色，量測見 §3.3）與 Safari 上的未知，而不是 WebGL。
2. 桌機與「平衡」以上才有真正的漸層（星雲精靈、行星光暈、光柱、桌面光暈、雲）。這些都是 8 位元後備緩衝、`ShaderMaterial` 無任何抖色，色帶只能靠抖色解決。實測 TPDF 抖色把「逐列平均」的誤差從 0.289 LSB 降到 0.006 LSB（§3.2）。
3. 手機真正的效能與畫質槓桿是像素比與不透明度，不是漸層演算法：手機 `high` 與 `balanced` 的像素上限相同（都是 1.5，而螢幕是 dpr 3），所以「高」在手機上是空檔；透明物件約佔一半的 CPU 送繪成本。
4. 這台 M4 無法量出手機 GPU 的填充率極限（§3.4），所有「手機更快」的主張需要真機驗證。本文把能量的量了，量不到的明講。

## 1. 網路研究（來源、日期、說了什麼）

說明：WebFetch 摘要由小模型產生，PDF 投影片在這個環境無法逐頁渲染（沒有 `pdftoppm`），所以標「摘要」的條目是由搜尋或抓取摘要得來，不是我逐頁讀過的投影片。凡是只有搜尋摘要支持的主張，都在後面標了「未逐頁驗證」。超過三年的來源仍列出，因為原理未變。

### 1.1 色帶與抖色

| 來源 | 日期 | 內容 |
| --- | --- | --- |
| Jimenez, Next Generation Post Processing in Call of Duty: Advanced Warfare。https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare | 2014（SIGGRAPH，超過三年） | 頁面只提到 Interleaved Gradient Noise 用於陰影濾波，沒有公式。 |
| IGN 公式（二手：https://blog.demofox.org/2017/10/31/animating-noise-for-integration-over-time/ ，搜尋摘要） | 2017 | `fract(52.9829189 * fract(0.06711056*x + 0.00583715*y))`；成本與白噪聲相近、品質介於白噪聲與藍噪聲之間。公式本身未對照 Jimenez 投影片逐字驗證，但我用它在 §3.2 實作並量到預期效果。 |
| Wronski, Dithering part three。https://bartwronski.com/2016/10/30/dithering-part-three-real-world-2d-quantization-dithering/ | 2016-10-30（超過三年） | 原文：「Whenever possible, avoid ordered Bayer!」會有明顯圖樣；IGN 是便宜且好看的折衷（可能有些鋸齒）；有預算時藍噪聲最好；三角分佈（TPDF）能消除色帶而不過度增噪。 |
| Playdead, Banding in Games（http://loopit.dk/banding_in_games.pdf）；Low Complexity, High Fidelity: INSIDE Rendering（https://gdcvault.com/play/1023304/Low-Complexity-High-Fidelity-INSIDE，僅付費影片，只用到搜尋摘要） | 2014 / 2016（超過三年） | 8 位元只有 256 階導致色帶；用三角分佈噪聲抖色，要放在所有色彩處理之後、量化之前（抓取摘要，未逐頁驗證）。 |
| three.js discourse 色帶串（https://discourse.threejs.org/t/subtle-colour-banding-issue-looks-like-256-colours-when-using-bloom-with-effect-composer/31174 、https://discourse.threejs.org/t/is-the-best-practice-a-dark-background-for-bloom-to-avoid-banding/72377） | 2021 / 2024 | 色帶來自預設 `UnsignedByteType` 的 render target；後處理鏈改 `HalfFloatType`；加噪聲只能讓色帶「較不明顯」。（搜尋摘要） |
| three.js 本機原始碼 `three@0.186.1` `dithering_pars_fragment.glsl.js`（已讀） | r186 | 內建 `material.dithering` 是 `rand(gl_FragCoord)` 的 ±0.5 LSB（`0.25/255 * 2`）均勻噪聲（RPDF），改自 shadertoy MslGR8；`WebGLRenderer` 有 `outputBufferType`（預設 UnsignedByte，HDR 與後處理才用 HalfFloat）。 |

### 1.2 色彩空間與內插

| 來源 | 日期 | 內容 |
| --- | --- | --- |
| Ottosson, A perceptual color space for image processing。https://bottosson.github.io/posts/oklab/ | 2020-12-23（超過三年） | OKLab 設計成 L、C、h 近似正交，混色時不會像 CIELAB、HSV 往紫色偏；適合平滑均勻的色彩漸變。 |
| MDN linear-gradient。https://developer.mozilla.org/en-US/docs/Web/CSS/gradient/linear-gradient | 現行 | 支援 `linear-gradient(in oklab, ...)`、`in oklch`、`in srgb-linear` 等內插色彩空間；頁面沒有說預設內插空間，也沒有談色帶或抖色。 |
| 搜尋摘要：Skia 對漸層做抖色（`SkPaint::setDither`）；Safari 的 CSS 漸層被指「缺少抖色而色帶明顯」；Firefox 有長期未解的漸層色帶 bug（https://bugzilla.mozilla.org/show_bug.cgi?id=1007670）；CSS 規格允許抖色但沒強制（https://lists.w3.org/Archives/Public/www-style/2016Feb/0172.html ） | 2016 至 2025 | Safari 現況我沒有驗證（WebKit 在這個環境跑不起來，見 `docs/design-system.md`），此條只作風險旗標。 |

### 1.3 行動 GPU（分塊式渲染）

| 來源 | 日期 | 內容 |
| --- | --- | --- |
| Apple WWDC20 10602 等（搜尋摘要，https://developer.apple.com/wwdc20/10602 ） | 2020 | Apple GPU 是 TBDR：隱藏面移除、無記憶體 render target、高效率 MSAA（硬體追蹤邊緣像素，只對邊緣逐 sample 混合）。 |
| Arm Mali 抽象機器與最佳實踐（https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/the-mali-gpu-an-abstract-machine-part-2---tile-based-rendering ；Arm 論壇與部落格搜尋摘要） | 2014 起、持續更新 | tile 夠小，4x/8x/16x MSAA 能放在 tile 記憶體內，成本低；`GL_BLEND` 的透明層每層都要取樣讀 alpha，即使最後被蓋住；片段著色器 `discard` 會迫使 late-z；半透明要由後往前畫就產生 overdraw。 |
| three.js `WebGLRenderer`（https://threejs.org/docs/pages/WebGLRenderer.html ，抓取摘要） | 現行 | `antialias` 預設 false，文件註記 MSAA 可能影響行動效能。 |
| **矛盾** | | three.js 文件說行動 MSAA 可能貴，Arm 與 Apple 說分塊式 GPU 的 4x MSAA 很便宜。兩者並不衝突（前者是保守警告，後者是硬體機制），但沒有任何來源給出 WebGL 預設 framebuffer 在 iOS Safari 上的實際成本，所以只能真機 A/B（建議 §4-R5）。 |

### 1.4 R3F、drei 與生命週期

| 來源 | 內容 |
| --- | --- |
| R3F pitfalls，https://r3f.docs.pmnd.rs/advanced/pitfalls （抓取摘要） | 不要在 `useFrame` 裡 setState；執行時掛載元件會重編譯材質與幾何；共用材質幾何；不要每幀建立物件。 |
| R3F scaling performance，https://r3f.docs.pmnd.rs/advanced/scaling-performance | `frameloop="demand"` 省電；動態 dpr；`regress()`；instancing；`dispose`。 |
| drei PerformanceMonitor，https://drei.docs.pmnd.rs/performances/performance-monitor | 預設 250 ms × 10 次取樣、`threshold` 0.75、`flipflops` 防震盪、`factor` 0.5；用 `onIncline`/`onDecline` 調 dpr。 |
| Khronos HandlingContextLost，https://wikis.khronos.org/webgl/HandlingContextLost（Cloudflare 擋 WebFetch，只有搜尋摘要） | 必須 `preventDefault()` 才可能恢復；`webglcontextrestored` 後所有資源失效，需重建紋理、緩衝與程式。 |
| WebKit bug 215745，https://bugs.webkit.org/show_bug.cgi?id=215745 | 2020：低電量模式下 iOS Safari 把 `requestAnimationFrame` 節流到 30 fps，是刻意行為。 |
| Safari canvas 限制（搜尋摘要，https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ 、https://developer.apple.com/forums/thread/687866 ） | 單一 canvas 面積上限 16,777,216 像素；總 canvas 記憶體上限曾為 448 MB 後降為 224 MB（社群回報，未對照 WebKit 原始碼）。 |
| backdrop-filter（搜尋摘要，https://www.buildmvpfast.com/blog/liquid-glass-css-backdrop-filter-recipes-2026 ，部落格，非一手） | 每幀需重新合成背後內容再模糊；不要動畫化模糊半徑；同時使用的元素數要少；手機降低或關閉。一手來源（Chrome 或 WebKit）沒有找到，視為待驗證。 |

沒有找到、也沒有宣稱的東西：Qualcomm Adreno 官方指南、WebGL 在 iOS 上 MSAA 的實測、Safari 目前是否對 CSS 漸層抖色。

## 2. 本專案稽核（證據）

### 2.1 渲染器與分級

- `packages/office-scene/src/components/OfficeScene.tsx:229-238`：R3F `<Canvas>`，`frameloop={warm && !props.paused ? 'demand' : 'never'}`、`dpr={[0.75, maxRatio]}`、`gl={{ antialias: !compact && quality !== 'low', powerPreference: 'high-performance', alpha: false }}`。沒有 `preserveDrawingBuffer`。
- 像素比上限（`OfficeScene.tsx` 約 195 行）：`high ? (compact ? 1.5 : 2) : balanced ? 1.5 : 1`。**手機的 `high` 與 `balanced` 都是 1.5**，實測兩者的繪製數、程式數、GPU 記憶體完全相同（§3.1）。
- 分級由偏好值決定，預設 `balanced`（`apps/web/src/lib/preferences/state.ts:39`）；沒有 UA、GPU 探測或 dpr 探測。手機版由頁面傳入 `compact`。減少動態來自 `matchMedia('(prefers-reduced-motion: reduce)')`（`state.ts:40`）。
- 色調與色彩空間：R3F 預設在 `toneMapping` 未指定且非 `flat` 時使用 ACESFilmic（`@react-three/fiber@9.8.1` `events-*.cjs.dev.js:1640`），輸出 sRGB，後備緩衝是 8 位元。專案內沒有任何 `dithering`、後處理或 HalfFloat。
- 動態解析度：`PerfControllers.tsx` 的 `AdaptiveRatio`，30 幀滾動中位數，慢 40% 就降 0.25（最低 0.75），快 5% 以內 90 幀才升，冷卻 1 s 與 4 s；對手機環境節奏目標是 30 Hz。這已經是 drei `PerformanceMonitor` 的自製等價物，不需要換。
- 閒置：`AnimationClock` 手機環境節奏 50 ms（約 20 fps，`SceneRuntime.tsx`），桌機 24 ms；`document.hidden` 不排程；工作表蓋住場景時 `paused={covered}`（`SceneView.tsx:241`）使 `frameloop='never'`，文件實測主執行緒 1.0 至 1.3 s 降到 0.07 至 0.29 s（`docs/design-system.md`）。
- Context lost：`SceneRuntime.tsx` 對 `webglcontextlost` 做 `preventDefault()` 後呼叫 `onFailure`，頁面把視圖切到 2D 並顯示提示（`SceneView.tsx:301-304`）。沒有 `webglcontextrestored` 路徑，所以沒有原地恢復。
- 暖機：`Warmup` 以 `compileAsync` 在載入罩後面編譯，最多 4 s；程式數因此加倍（`design-system.md`）。第一次出現的 subagent 角色在手機設定仍連結 9 個程式，約 110 至 125 ms（4x 節流，`docs/verification/report.md` OFFICE-LIFE-F1-02）。

### 2.2 每一個漸層或色帶敏感的表面

| 表面 | 產生方式 | 位置 | 手機是否繪製 | 備註 |
| --- | --- | --- | --- | --- |
| 天空背景 | 單色 `#050e15` + 霧 | `SceneLights.tsx:14-15` | 是 | 不是漸層，無色帶。 |
| 行星地球 | Canvas2D 2048x1024 RGBA，內含 `createLinearGradient`（海洋）、150 個 `createRadialGradient`（雲）、極地線性漸層 | `OrbitalBackdrop.tsx:84-136` | 是（低面數球 40x24） | 預設 `CanvasTexture`，`generateMipmaps` 開，約 11 MB 含 mip；佔 rig 估算 57 MB 的約 20%。手機上只在頂端露出一角（§3.1 截圖）。 |
| 星雲光暈 x3 | Canvas2D 256x256 徑向漸層，加法混合精靈，尺寸 360 至 520 世界單位 | `OrbitalBackdrop.tsx:138-150, 160-190` | 否（`low` 時不畫；但 `useMemo` 仍建立三張 canvas） | 色帶風險最高的表面：暗背景加上加法低 alpha。 |
| 行星光暈 | 兩層 `meshBasicMaterial`，透明，一層 BackSide 加法 | `OrbitalBackdrop.tsx` | 是 | 全螢幕外的大球殼，額外 overdraw。 |
| 桌面光暈、腳下陰影 | 共用 64x64 徑向漸層 canvas，加法或普通混合平面 | `DeskGlow.tsx:11-24` | 只有腳下陰影（手機無桌面光暈） | `DeskEffects.tsx:16-25` 的 `softDot` 沒設 `colorSpace`（白色紋理，不影響顏色，只是風格不一致）。 |
| 光柱、塵埃 | `ShaderMaterial` 程序式（`across`、`along` 冪次漸層），加法 | `Atmosphere.tsx` | 否（手機與低階關） | 輸出沒有 `<colorspace_fragment>`（`gl_FragColor` 直接寫），也沒有抖色。 |
| 雲 | `ShaderMaterial`，hash 值噪聲 3 個八度，alpha 混合 | `Clouds.tsx:56-78` | 是（只在塔的場景） | 值噪聲不是 Perlin 或 simplex 梯度噪聲；hash 為 `fract(sin(dot))`，在 mediump 手機 GPU 上有精度偽影風險（未量測）。 |
| 花瓣與玻璃絲 | `garden-material.ts` 程序式：`mix(vTintA, vTintB, smoothstep(u))`、虹彩 cos 調色盤、預乘 `CustomBlending` | `garden-material.ts:60-130` | 否（手機關塔） | 以 `1 - exp(-color*2.2)` 自製色調，不經 ACES，也無抖色。 |
| 精靈圖集 | Canvas2D 1024x512，`LinearMipmapLinear`、各向異性 4 | `sprite-pool.ts:58-63` | 是 | 一次繪製。 |
| 螢幕紋理 | Canvas2D 640x400 每位成員，`needsUpdate` 在事實改變才上傳（`screen-facts.ts:159`），次要螢幕 320x250 | `screens.ts`、`screen-facts.ts` | 是 | 12 位成員約 16 MB（估算）。 |
| 光束虛線 | `DataTexture` 8x1，Nearest | `BranchBeams.tsx:21-29` | 是 | 合理。 |
| CSS：名牌、說話泡泡、KPI 牌、掃描線 | `linear-gradient` 加 `color-mix(in srgb)`，`repeating-linear-gradient` | `name-tag.css:23,108,140`、`scene-speech.css:31,54`、`kpi.css:514,548`、`scene-pips.css:54,72,88` | 是 | `name-tag.css:108-116` 的閃爍動畫是 `background-position` 無限動畫（`tag-shimmer`，2.8 s），每個「工作中」名牌都在重繪（不是 compositor 屬性）。 |
| CSS：上下文條 | `linear-gradient(90deg, mint, blue 55%, gold 80%, red)` 3 px 高 | `session-panel.css:227` | 是 | |
| CSS：`backdrop-filter` | 8 至 10 px 模糊 x 約 15 處 | `shell.css:15`、`phone-sheet.css:24`、`phone-office-scene.css:55,112`、`scene-overlays.css:16,65,161`、`kpi.css:105,609` 等 | 是 | 疊在持續更新的 WebGL canvas 上的，手機版有 `phone-office-scene.css` 兩處與 `scene-overlays.css`。 |

名牌是 DOM 疊層，每幀以 `style.transform` 擺位（`ProjectedBoxes.tsx:38,48`），所以文字在任何 dpr 下都是向量銳利，不受 3D 解析度影響。這是目前做法的優點，不要改成 sprite。

紋理旗標：所有彩色紋理設 `SRGBColorSpace`（正確，少數例外見上表）；預乘 alpha：`CanvasTexture` 預設不預乘上傳，花瓣材質自己用 `OneFactor/OneMinusSrcAlphaFactor` 預乘；`ShaderMaterial` 精靈圖集以直 alpha 輸出再走 three 預設混合，一致。

### 2.3 既有量測（引用，不是新跑的）

- `docs/design/office-life.md` §4.9 的手機設定（390x844、dpr 3、4x CPU 節流、精簡、無塔、平衡）：基底 16.7 / 18.3 ms（p50 / p95）、`jsMs` 5.8 至 5.2、183 繪製、86k 三角形、19 程式；加小隊 208 繪製、25 程式。桌機 1440x900 高階基底 225 繪製、368k 三角形、30 程式。
- 手機啟動預算（`docs/design-system.md`）：場景 57 MB GPU、111 繪製、86k 三角形、15 程式；場景閒置時佔主執行緒 14%（4x 節流）。
- 文件記錄 M4 在 60 Hz 受 vsync 限制，所以成本只能看 `jsMs`。

預算去向：CPU 為主（程式查詢 20%、骨架上傳 13%、矩陣更新 10%，`design-system.md`），不是 GPU；這與我下一節的新量測一致。

## 3. 本次新量測

環境：Chrome（`channel: 'chrome'`、`--use-angle=metal`），`ANGLE (Apple, ANGLE Metal Renderer: Apple M4)`，示範模式伺服器，我自己的埠 4581（已關閉，暫存腳本已刪）。腳本與原始 JSON 都在
`/private/tmp/claude-501/-Users-dev-Tools-aether-office/23475a39-1333-4543-9901-a8d3f9736ec7/scratchpad/gradient-perf/`
（`run-matrix.sh`、`matrix-phone-{balanced,low,high}.json`、`gpu.mjs`、`gpu-vsync-off.json`、`dither.mjs`、`dither-metrics.json`、`band.mjs`、`css.mjs`、`tex.mjs`）。

### 3.1 手機設定基準（`scripts/perf-matrix.mjs --phone`，390x844、dpr 3、4x 節流，3 輪，240 幀，中位數）

| 分級 | 首次 p50 / p95 | 動態 p50 / p95 | `jsMs`（首次 / 動態） | 繪製 | 三角形 | 程式 | GPU MB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| balanced | 16.7 / 18.6 | 16.7 / 18.5 | 3.1 / 2.8 | 111 | 85,674 | 21 | 57.3 |
| low | 16.6 / 18.5 | 16.7 / 18.4 | 3.0 / 2.7 | 111 | 85,674 | 19 | 54.5 |
| high | 16.6 / 18.5 | 16.7 / 18.3 | 3.0 / 2.6 | 111 | 85,674 | 21 | 57.3 |

讀法：三個分級幾乎一樣。`high` 與 `balanced` 在手機上逐項相同（繪製、三角形、程式、GPU MB），因為上限都是 1.5，所以手機的「高」沒有任何作用。最差單幀 68 至 109 ms 是掛載後暖機的一次性峰值（`maxMs`）。幀時間被 vsync 釘在 16.7 ms，看不出 GPU 成本。

首頁截圖（dpr 3 實體像素，`phone-balanced-full.png`、`phone-low-full.png`、`desk-balanced-full.png`）：未節流時，手機平衡的實際畫布是 487x925（像素比 1.25，起始 1.5 已被 `AdaptiveRatio` 降到 1.25，單一樣本），螢幕實體像素是 1170x2532，所以 3D 場景是以約 42% 的原生解析度放大顯示；低階是 1.0（390x740，33%）。我看了這些截圖：手機上沒有可見的漸層色帶，因為沒有漸層；放大偏糊在地板網格線與細線上最明顯。桌機（1440x900，dpr 2，平衡）畫布 1707x810（像素比 1.5），行星頂端露出一圈光暈。

### 3.2 抖色的客觀效果（獨立 WebGL2 測試頁，M4 Metal）

做法：1000 px 高的垂直漸層，起點 `#050e15`、終點 `#123b51`（在線性光中混合再編碼為 sRGB，模仿 three 的輸出），四種模式各畫一次，用 `readPixels` 讀回：`none`、`three`（three 內建 `dithering` 的公式）、`rpdf`（一個 IGN，±0.5 LSB）、`tpdf`（兩個 IGN 相加，±1 LSB）。指標：

- 離散階數（紅 14、綠 46、藍 61，與理論階數相同，抖色不會增加階數）。
- 最長相同值連續列數（色帶寬度，單欄）：紅 96 px，無抖色；three 內建 32；rpdf 31；tpdf 20。
- 逐列平均誤差（對 400 像素取平均後與解析解的 RMS，單位 LSB，代表眼睛積分後的準確度）：無抖色 0.289；three 0.020 至 0.030；rpdf 0.005 至 0.022；tpdf 0.006 至 0.023。
- 逐像素誤差（RMS）：無抖色 0.289；三種抖色約 0.40 至 0.43（抖色用逐像素噪聲換取平均準確度，這是預期代價）。

結論：任何抖色都把色帶寬度縮短 3 至 5 倍、把平均誤差降約 15 至 50 倍；TPDF 的色帶最短，但相對內建 RPDF 只多一次噪聲計算。three 內建的 `dithering` 已足以改善且零程式碼；三角分佈只在高對比放大（例如大面積暗漸層全螢幕）才有可見差別。

這是合成漸層測試，不是專案場景本身。專案場景的色帶沒有直接量測：場景截圖裡的星雲在手機與桌機鏡頭中都不在畫面，行星區的曲線混有紋理內容，不是乾淨的漸層（我嘗試過，數字不可用，已捨棄）。

### 3.3 CSS 漸層（Chromium，dpr 3）

用真實 token 值（`tokens.css`）的測試頁（`css-gradients-dpr3.png`）：上下文條（1170 px 寬）52 階全部出現、相鄰最大差 1、沒有長平段（最長 20 px，抖色的結果）；`in oklab` 版本離散階數相同；名牌漸層（15 階，480 px）也一樣；`scene-pips` 的 `transparent` 淡出只跨 4 階（10 至 13），那是內容本身對比太小，不是演算法問題。所有 CSS 剖面的相鄰最大差都是 1，轉折次數（約 240 至 310）遠多於階數，這是 Skia 抖色的特徵。**結論：Chromium（桌機與 Android Chrome）上 CSS 漸層沒有色帶問題。Safari 未量測。**

### 3.4 GPU 對像素數的敏感度（`--disable-gpu-vsync --disable-frame-rate-limit`，高階，`gpu.mjs`）

| 設定 | 手機（390x844 實體 dpr 3） | 桌機（1440x900 實體 dpr 2） |
| --- | --- | --- |
| 像素比 1.0 | 中位數 1.0 ms、p95 2.4 | 4.2 / 5.1 |
| 1.5 | 1.3 / 3.6（基準 1.0 / 2.4） | 4.1 / 4.8 |
| 2.0 | 1.1 / 2.3 | 4.4 / 5.2 |
| 3.0 | 1.2 / 2.5 | 5.1 / 10.5 |

（0.75 那一列因 R3F 在 demand 模式下延遲 resize，實際像素數不符，已捨棄。）手機從 1.0 到 3.0（像素數 11 倍）幀時間幾乎不變：M4 的填充率遠過剩，這個場景在 M4 上受 CPU 送繪限制（`render` 約 0.9 至 1.0 ms，樞紐在繪製呼叫數）。**所以這台機器證明不了手機 GPU 在 dpr 2 或 3 是否撐得住。**

隱藏類別（同一場景，用 `?intensity=3`，繪製數比基準 111 高，因為忙碌的桌面螢幕與角色都開）：

| 隱藏對象 | 手機：繪製 / 中位數 / `render` ms | 桌機：繪製 / 中位數 / `render` ms |
| --- | --- | --- |
| 無（基準） | 195 / 1.0 / 0.9 | 230 / 3.8 / 1.1 |
| 加法混合物件（手機 24、桌機 29 個） | 163 / 1.0 / 0.8 | 194 / 3.8 / 1.0 |
| 所有 `transparent` 物件（手機 102、桌機 99 個） | 49 / 0.4 / 0.2 | 88 / 2.8 / 0.3 |

透明物件只佔場景繪製數的約一半，卻佔 CPU 送繪時間的約 75%（手機 0.9 到 0.2 ms；桌機 1.1 到 0.3 ms），在 4x 節流下這個比例仍是主要成本。加法效果本身（光暈、環、光束）很便宜（約 0.1 ms）。我沒有逐一歸因這 102 個透明物件是哪些（玻璃牆、標記、環、精靈）；這是 §4-R4 的第一步。

### 3.5 啟動時建立紋理的 CPU 成本

行星紋理（2048x1024，含 7 個多邊形、150 個雲徑向漸層）在 4x 節流的頁面上建立與讀回約 29 ms（多邊形是簡化版，雲數量與真實一致）。不貴，但在載入罩後面。星雲 canvas 的來源階數：alpha 在 128 px 半徑內有 72 至 128 個不同值，不是色帶的瓶頸，8 位元輸出才是。

### 3.6 沒有量到的

真機（沒有 iPhone 或 Android 實機、沒有 Safari，WebKit 在此環境跑不起來）；手機 GPU 的填充率與熱降頻；Safari 的 CSS 漸層是否抖色；MSAA 在 iOS WebGL 上的實際成本；`backdrop-filter` 的實際成本；真實場景（非合成）的色帶度量；`AdaptiveRatio` 在真機的行為（我在 M4 看到手機平衡起始即被降到 1.25，單一樣本，原因未查，可能是 demand 模式啟動期的幀間隔）。

## 4. 建議（依 效益 / 風險 排序）

驗證通則見 §6。工作量：S 小、M 中、L 大。

**R1　讓手機的「高」真的更高（像素比上限 1.5 到 2，再讓 `AdaptiveRatio` 保底）。**
- 為何：目前手機 `high` 與 `balanced` 實測逐項相同（§3.1），螢幕是 dpr 3，場景以約 42% 的原生解析度顯示，細線與網格偏糊。名牌是 DOM，所以文字不受影響；受影響的是 3D 邊緣。
- 預期：邊緣與網格明顯較銳（像素數從 1.5 到 2 為 1.78 倍）；風險是真機填充率。M4 無法回答（§3.4）。
- 作法：只改「高」且 `compact` 的上限為 2，預設 `balanced` 仍為 1.5，讓使用者選擇；`AdaptiveRatio` 已能在慢時往下降。檔案：`OfficeScene.tsx`（`maxRatio` 一行）與 `docs/design-system.md` 分級表。
- 驗證：真機 p95 幀時間與熱降頻（持續 5 分鐘）；`perf-matrix.mjs --phone` 的繪製數與程式數不變。風險：中（只有實機能證）。工作量 S。這是畫質增益最大、程式碼最小的一項，但必須先在一台真機驗收。

**R2　在加法與透明漸層著色器加上內建抖色（一行程式）。**
- 為何：§3.2：色帶寬度縮短 3 至 5 倍，平均誤差降 15 至 50 倍，成本是兩三個 ALU 運算。來源：Wronski（IGN 便宜、避開 Bayer）、Playdead（抖色放在量化前最後一步，TPDF）、three 內建 `dithering` 公式（±0.5 LSB）。
- 作法：對 `ShaderMaterial`（光柱、塵埃、雲、花瓣、精靈圖集）在 `<colorspace_fragment>` 後加 `#include <dithering_fragment>` 並設 `dithering: true`；對 `meshBasicMaterial` 的光暈與行星光暈只設 `dithering: true`。想要 TPDF 才換自訂函式（相對內建多一次 IGN；非必要）。沒有新依賴。
- 範圍提醒：加法疊多層時每層都會在 8 位元緩衝量化，所以每一層各自抖色；不要用大振幅（內建 ±0.5 LSB 已夠）。
- 注意：手機幾乎沒有這些漸層（§0），所以這項的價值在桌機與平衡以上；手機上只影響精靈與腳下陰影。檔案：`Atmosphere.tsx`、`Clouds.tsx`、`garden-material.ts`、`sprite-pool.ts`、`DeskGlow.tsx`、`OrbitalBackdrop.tsx`。
- 驗證：新增一個 playwright 圖像測試，量「逐列平均 RMS 誤差」或相鄰 16x16 區塊平均的最大階差，不得變差；繪製、程式與 p95 不變。風險：低（噪聲可見度要眼看確認，暗背景加法層的 ±0.5 LSB 在 dpr 2 以上看不到）。工作量 S。

**R3　行星紋理在手機與低階縮為 1024x512，且不重算。**
- 為何：2048x1024 含 mip 約 11 MB，佔估算的 57 MB 約 20%（`perf-rig.ts` 的公式），而手機上只露出一角（§3.1 截圖）。`docs/design-system.md` 也說 KTX2 不值得轉碼器。縮小尺寸不加任何依賴。
- 預期：GPU 記憶體約 -8 MB（手機）；啟動 canvas CPU 約 -75%。風險：低（球很小）。驗證：`perf-matrix` 的 `gpuMB` 下降、截圖比對。工作量 S。檔案：`OrbitalBackdrop.tsx`（`earthTexture` 依 `low` 縮放；`glows` 在 `low` 時不建立）。

**R4　先歸因，再減少透明物件的繪製呼叫。**
- 為何：透明物件佔場景繪製呼叫約一半、CPU 送繪時間約 75%（§3.4）。Arm：每個透明層都要取樣讀 alpha，且需由後往前排序；three 的透明物件還要每幀排序與切換狀態。
- 作法：在 `?perf` 探針用腳本列出前 20 個透明物件（名稱、材質、繪製次數），再把同材質的合併或 instancing；不能合併的改成不透明加 alpha-to-coverage 或 `alphaTest`（注意 Arm 提醒 `discard` 會停用 early-z，所以只對小面積使用）。
- 預期：手機繪製數 -30% 至 -50% 是上限（不確定，取決於歸因）；`render` ms 同比。風險：中（視覺回歸）。驗證：`perf-matrix` 繪製數、`jsMs`、p95；截圖比對。工作量 M。

**R5　手機上 MSAA 的真機 A/B（不先改）。**
- 為何：目前手機 `antialias: false`，像素比 1.25 至 1.5 時邊緣鋸齒。Arm 與 Apple 說分塊式 GPU 的 4x MSAA 便宜；three 文件警告行動成本。兩者矛盾且沒有 iOS WebGL 數據（§1.3），所以不能預先決定。FXAA/SMAA 需要後處理通道，而這個專案目前沒有，加上去要一個 render target 與一個全螢幕通道，通常比 MSAA 在 TBDR 上更貴，也不是零依賴；TAA 需要運動向量，不適合 demand 渲染。
- 作法：先做 R1（較高 dpr 本身就是抗鋸齒），再用一個臨時旗標（URL 參數）在真機 A/B `antialias`。工作量 S（旗標）加真機時間。風險：低到中。

**R6　手機上把疊在 WebGL 上的 `backdrop-filter` 改為不透明或預混色。**
- 為何：疊在持續更新（約 20 fps）的 canvas 上的毛玻璃每次都要重新合成並模糊（§1.4，二手來源，待驗證）。目前手機路徑有 `phone-office-scene.css:55,112`、`scene-overlays.css:16,65,161`、`kpi.css:105,609`、`shell.css:15`。
- 預期：減少合成成本，尤其 Safari；視覺上改用 `--glass-strong` 這類本來就半透明的實色，差異小。風險：低。驗證：真機滑動與 Safari 時間軸；CSS 規格（responsive 與 accessibility spec）通過。工作量 S。需要先在真機量到再做，才符合「不先動」原則。

**R7　`tag-shimmer` 改成 compositor 動畫或停用於手機與遠密度。**
- 為何：`name-tag.css:108-117,182` 對每個「工作中」名牌無限動畫 `background-position`，這是會重繪的屬性，不是 compositor 屬性。12 位成員全在工作時就是 12 個持續重繪的 DOM 層。
- 作法：改成偽元素用 `transform: translateX()` 滑動（同樣的視覺，compositor），並在 `data-density='far'` 與 `prefers-reduced-motion` 時已為 none（已有，`name-tag.css:200,209`）。風險：低。驗證：CDP 追蹤 Paint 次數或 `Layers` 面板（我沒量，這是依屬性類別推論）。工作量 S。

**R8　WebGL context 恢復（iOS）。**
- 為何：現在 context lost 會切到 2D 並提示（§2.1）。Khronos 說有 `preventDefault()` 才可能恢復，`webglcontextrestored` 後所有資源要重建；three 的 `WebGLRenderer` 內建會在 restored 事件重新初始化其內部狀態，但專案自建的 `CanvasTexture` 需要 `needsUpdate`（three 會重新上傳，通常不需處理，未驗證）。
- 作法：先在真機觀察 iOS 背景化回前景是否真的會 lost；若會，在 `Runtime` 加一個 restored 路徑讓 `invalidate()` 與暖機重跑，而不是切 2D。風險：中。工作量 M。沒有真機證據前不動。

另外（不要列入排序，已經做對）：像素比動態調整、`frameloop='demand'`、工作表蓋住時暫停、隱藏分頁不排程、手機環境節奏 20 fps（與 iOS 低電量模式的 30 fps 節流相容，WebKit bug 215745）、名牌用 DOM、單一精靈圖集一次繪製。

## 5. 不要做的清單

- **不要為了色帶加後處理與 HalfFloat render target。** 專案沒有後處理，HalfFloat 只在後處理鏈裡有意義（three 文件的 `outputBufferType` 註解），多一個全螢幕通道在 TBDR 上是額外頻寬。用抖色。
- **不要用 Bayer 有序抖色。** Wronski：圖樣明顯。
- **不要為了漸層改用 OKLab 或 OKLCH。** 手機 3D 場景幾乎沒有漸層；CSS 的 `in oklab` 在 Chromium 測起來階數與色帶與預設相同（§3.3），只在色相路徑（如 mint 到 gold）才有視覺差別。若要用，只用在上下文條（一行，無效能成本，風險最低）。在著色器裡做 OKLab 轉換對 ALU 有成本但沒有可量化的收益。
- **不要為了「畫質」把手機像素比直接拉到 3。** 填充率與熱降頻沒有證據（§3.4 證明不了）；先 R1 到 2。
- **不要把名牌改成 3D sprite 或 drei `Html` 以外的方案。** DOM 文字在任何 dpr 都銳利，成本已在探針中。
- **不要為了省紋理上傳把螢幕 canvas 改成每幀重繪。** 目前是事實改變才上傳（`screen-facts.ts:159`）。
- **不要加 KTX2 或 basis 轉碼器。** 57 MB 場景，沒有量到的收益（既有結論，`design-system.md`）；紋理多是 Canvas2D 生成，轉碼器也無法壓縮它們。
- **不要把 Canvas2D 徑向漸層換成程序式著色器當作效能優化。** 64x64 與 256x256 紋理成本可忽略，換成著色器每個像素要算 `length`/`smoothstep`，還要多一個程式（程式預算已超：squad 6 至 7 個對預算 4）。只有在需要動畫或抖色整合時才換。
- **不要對大面積透明層用 `discard` 或 alpha-test 當作省 overdraw 的方法。** Arm：`discard` 迫使 late-z；只對小面積使用。
- **不要把 `backdrop-filter` 模糊半徑做動畫。** 二手來源與直覺一致。
- **不要用 `will-change` 到處加層。** 每層都耗記憶體；專案目前沒有 `will-change` 使用，也沒有證據需要。
- **不要預設啟用 30 fps 上限以外的新節流。** 已有 20 fps 手機環境節奏；iOS 低電量模式自己會降到 30 fps。

## 6. 量測守則（任何後續變更必須通過）

接受條件：以下三個指標都不得比基準變差（在誤差內，每個案例至少 3 輪交錯），且至少有一項要有明確收益。

1. **p95 幀時間與 `jsMs`：** `node scripts/perf-matrix.mjs --cases 'base=;variant=...' --phone --size 390x844 --dpr 3 --throttle 4 --rounds 3 --frames 240 --motion`；各分級 balanced、low、high 都要跑（`PERF_GPU=1` 的正式規格 `e2e/office-life/office-life-perf.spec.ts` 照常）。M4 受 vsync 限制，所以看 `jsMs` 與 `renderMs`；要看 GPU 極限就加 `--disable-gpu-vsync --disable-frame-rate-limit` 並指明這是非正式量測。
2. **繪製數、三角形、程式數、`gpuMB`：** 同一份報告的 `draws`、`triangles`、`programs`、`gpuMB`，不得增加（R3 要減少）。
3. **色帶指標：** 對固定截圖的漸層區塊算（a）逐列平均與解析解的 RMS（LSB），（b）相鄰 16x16 區塊平均的最大階差；腳本範本是 `dither.mjs` 與 `band.mjs`（用頁面 canvas 解 PNG，不加依賴）。不得變差；R2 預期（a）降到 0.05 以下。單欄「最長相同值連續列數」只當輔助，因為抖色本來就會讓它較短。
4. **真機（任何影響像素比、MSAA、`backdrop-filter`、context 的變更）：** 至少一台 iPhone（Safari）與一台 Android（Chrome），持續 5 分鐘，記錄 p95、掉幀與熱降頻後的幀時間；並以 Safari 看 CSS 漸層是否有色帶。沒有真機證據的變更不得宣稱「手機更快」。
5. **視覺檢查：** 手機尺寸與平板尺寸各看一次（`AGENTS.md` 的 UI 規則），暗背景用眼睛看 ±0.5 LSB 抖色是否可見。

## 7. 重現

```
# 手機設定基準（我用的是自己的埠 4581 與暫存伺服器；正式 e2e 用 4320/4330，不要動）
node scripts/perf-matrix.mjs --url http://127.0.0.1:4581 --token-file <session.json> \
  --cases 'base=' --quality balanced --size 390x844 --dpr 3 --throttle 4 --phone --rounds 3 --frames 240 --motion
```

其餘腳本（`gpu.mjs`、`dither.mjs`、`band.mjs`、`css.mjs`、`tex.mjs`、`shot.mjs`）在上面的暫存目錄，只用已安裝的 `@playwright/test`，沒有新增依賴；它們沒有放進專案，要保留就另外決定放哪裡。
