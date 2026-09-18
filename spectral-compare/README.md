# 录音频谱比对台（Spectral Compare）

完全在浏览器内运行的双录音频谱比对工具，面向声学工程场景。
**无服务端、无远程数据库**：原始音频只存在于本地内存，分析方案存储于本机 IndexedDB。

## 功能

- **WAV 加载**：手动解析 WAV（PCM 16/24/32 bit、IEEE 浮点），保留文件真实采样率
- **共享选区**：在波形上拖动创建时间选区，频谱即对该选区计算；选区状态由单一 store 驱动，波形与频谱始终一致
- **时间偏移校准**：手动输入 / 滑块调节 B 相对 A 的偏移（ms），或用 GCC-PHAT 互相关自动对齐；波形中 B 按偏移实时平移显示
- **窗函数切换**：Hann / Hamming / Blackman / Rectangular，FFT 大小 1024–32768
- **频段能量对比**：指定频段后显示 A/B 各自能量（dB）与差值；频段修改无需重算 FFT，直接从功率谱积分
- **显式重采样**：两段录音采样率不一致时，明确提示并在 Worker 中以加窗 sinc 将 B 重采样到 A 的采样率（不静默处理——`decodeAudioData` 会偷偷重采样，故本项目自行解析 WAV）
- **静音保护**：所有 dB 换算以 1e-12 功率下限截断到 -120 dB，界面永不出现 -Infinity
- **Web Worker 分析**：Welch 平均谱、重采样、GCC-PHAT 全部在 Worker 中执行，带进度显示
- **取消与过期保护**：每个分析请求有递增 requestId；取消后在途任务被中断，迟到的结果一律丢弃，绝不覆盖新选区
- **持久化**：分析方案（选区标记、窗函数、FFT 大小、频段、偏移、文件名）自动写入 IndexedDB，刷新后恢复标记位置；音频本身不入库
- **测试信号**：内置 440 Hz 样音、100 Hz/1 kHz/10 kHz 已知幅值校验信号、白噪声、静音-1kHz-静音（验证静音下限），均可试听、下载 WAV、一键载入 A/B
- **结果导出**：逐 bin 频谱对比 CSV、完整分析 JSON

## 开发

```bash
npm install
npm run dev        # 开发服务器
npm run check      # svelte-check 类型检查
npm run test       # vitest：DSP 核心单元测试（频谱/重采样/对齐/WAV 解码）
npm run build      # 生产构建
node e2e/smoke.mjs # 端到端冒烟测试（需 dev server 运行中 + Playwright Chromium）
```

## 架构

```
src/lib/
  types.ts                 共享类型与 Worker 消息协议
  stores.ts                Svelte stores（共享选区、参数、结果）
  analysisController.ts    主线程分析调度：防抖、requestId 过期防护、取消
  db.ts                    IndexedDB 方案持久化
  audio/
    wav.ts                 手动 WAV 解码（保留真实采样率）
    decode.ts              文件解码入口（非 PCM 回退 decodeAudioData）
    spectrum.ts            Welch 平均幅度谱（幅值/能量双归一化）
    resample.ts            加窗 sinc 重采样（带抗混叠）
    align.ts               GCC-PHAT 时延估计
    windows.ts             窗函数与能量修正因子
    dsp.ts                 dB 换算（-120 dB 下限）
    signals.ts             测试信号合成与 WAV 编码
  workers/spectrum.worker.ts  Worker 入口（取消标记 + 进度上报）
  components/              FileLoader / WaveformView / SpectrumView /
                           OffsetControl / BandCompare / SignalGenerator / ExportPanel
```

### 关键设计

- **归一化**：单边幅值谱按 `N·cg/2` 归一化，幅值 A 的正弦峰值读数为 A；
  频段能量额外乘窗能量修正 `cg²/eg`，使单音频段能量读数为 A²（校验信号可精确核对：
  0.5 → -6.02 dB，0.25 → -12.04 dB，0.125 → -18.06 dB）
- **过期结果防护**：`validIds` 集合 + 每通道 `latestByChannel`；取消时清空集合并通知
  Worker 中断计算循环，迟到的响应在入口即被丢弃
- **频段编辑零重算**：频段能量从已有功率谱积分得到，改频段不触发 FFT
