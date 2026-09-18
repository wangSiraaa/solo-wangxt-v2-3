# 录音频谱比对（spectra-compare）

完全在浏览器中运行的双录音频谱比对工具，面向声学测量场景。无服务端、无远程数据库：音频与分析方案均不离开本机。

## 功能

- **本地读取 WAV**：Web Audio API 解码（先解析 WAV 头取得真实采样率，用同采样率 `OfflineAudioContext` 解码，**杜绝浏览器隐式重采样**），多声道混合为单声道分析
- **成熟 FFT 库**：fft.js，Welch 平均功率谱（50% 重叠），在 **Web Worker** 中计算，长录音不卡界面
- **波形/频谱共享选区**：波形拖拽选区，频谱即该选区的谱；选区也可数值输入
- **时间偏移校准**：B 相对 A 的手动微调（±1ms/±0.01s/±0.1s）+ FFT 互相关**自动估计**
- **窗函数切换**：Hann / Hamming / Blackman / 矩形；FFT 尺寸 1024–16384
- **频段能量差**：指定频段 [fLow, fHigh]，显示 A/B 能量（dB）、差值与频段内峰值频率（抛物线插值）
- **显式重采样**：采样率不同时以 A 为参考，线性插值重采样 B，界面明确提示（如 `48000 → 44100 Hz`）
- **dB 地板**：功率下限 1e-12，静音段显示 −120 dB，绝不出现 −∞/NaN
- **取消分析**：请求 ID 守卫，取消后迟到的旧结果直接丢弃，不覆盖新选区
- **本地持久化**：分析方案（选区/标记/窗函数/频段/偏移）与解码后的 PCM 写入 IndexedDB，**刷新后恢复标记位置**；音频超过 64 MB 时只存方案
- **结果导出**：JSON（方案 + 频段对比 + 逐 bin dB 谱）与 CSV（逐 bin `freq, A_dB, B_dB, delta`）
- **播放**：Web Audio 播放 A/B 整段或当前选区（B 自动按校准偏移对齐）

## 快速开始

```bash
npm install
npm run dev        # 开发
npm run build      # 构建（dist/）
npm run preview    # 预览构建产物
```

界面按钮可直接载入交付样音（`public/samples/`，由 `npm run gen:samples` 重新生成）：

| 文件 | 说明 |
| --- | --- |
| `verify-1khz.wav` | **校验信号**：1000 Hz 正弦，幅值 0.5。频段设 900–1100 Hz 时能量应读 ≈ **−9.03 dB**（A²/2），峰值 ≈ 1000 Hz |
| `sample-a.wav` | 可播放样音 A：旋律片段，44.1 kHz |
| `sample-b.wav` | 可播放样音 B：同一旋律**延迟 0.35 s**、高频变暗、约 −3 dB，**48 kHz**（演示显式重采样与偏移校准） |

典型校验流程：载入示例 A/B → B 卡显示“已显式重采样 48000 → 44100 Hz”→ 点“自动估计偏移”得 ≈ +0.350 s → 载入 1 kHz 校验信号到 A、频段设 900–1100 Hz → 读数 ≈ −9 dB / 1000 Hz。

## 架构

```
src/lib/
  audio/
    decode.ts    WAV 头解析 + OfflineAudioContext 原采样率解码 + 单声道混合
    resample.ts  显式线性插值重采样
    windows.ts   窗函数系数与 Σw²
    welch.ts     Welch 累加器（fft.js，归一化单边功率谱）
    xcorr.ts     FFT 互相关偏移估计（降采样至 ≤8 kHz 加速）
    dsp.ts       dB 地板、频段能量、峰值频率
    player.ts    Web Audio 播放
  worker/
    spectrum.worker.ts  Worker：分块计算并周期性让出事件循环，cancel 消息即时生效
    analyzer.ts         主线程客户端：递增 requestId，迟到结果按 id 丢弃
  state/
    app.svelte.ts       Svelte 5 runes 响应式状态、分析调度、持久化调度
    db.ts               IndexedDB（idb）：plan / audio 两个 store
  components/           FileLoader / WaveformView / SpectrumView / ControlBar /
                        BandPanel / MarkerList / PlaybackBar / ExportPanel
```

**功率谱归一化**：`P[k] = c_k·|X[k]|² / (N·Σw²)`（c₀=1，其余 2），全频段求和 ≈ 时域均方值，幅值 A 的正弦所在频段能量 ≈ A²/2（Parseval 一致，测试比值 1.000）。

**取消防竞态**：每次分析分配递增 `requestId`；取消时通知 Worker 并使本地 Promise 以 `CancelledError` 结案；Worker 分块处理、每 32 帧让出事件循环检查取消标记；主线程另有序号守卫，迟到结果一律丢弃。

## 测试

```bash
npm run check            # svelte-check + tsc
npm run test:dsp         # DSP 数学校验（8 项：1kHz 读数、dB 地板、重采样、互相关、Parseval）
npm run test:e2e         # Playwright 端到端（重采样提示/自动偏移/校验信号/标记恢复/导出）
npm run test:e2e:cancel  # 取消分析端到端（120 s 长录音，取消后新选区结果正确）
```

e2e 需要先 `npm run build`，并安装 Playwright Chromium（`npx playwright install chromium`）。

## 隐私

所有计算在浏览器内完成；音频与方案仅写入本机 IndexedDB，没有任何网络上传。
