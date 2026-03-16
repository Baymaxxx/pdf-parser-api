import { useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Upload, AlertCircle, FileText } from 'lucide-react';
import { parsePdfInvoice } from '@/lib/pdfParser';
import GiftBoxAnimation from './GiftBoxAnimation';

// ─── no=1 模式下的基础解析动画 ────────────────────────────────
const PARSE_STEPS = [
  { key: 'upload',  label: '上传文件',   icon: '📤' },
  { key: 'read',    label: '读取 PDF',   icon: '📄' },
  { key: 'ocr',     label: 'OCR 识别',   icon: '🔍' },
  { key: 'extract', label: '提取数据',   icon: '✨' },
];

const ParseLoadingView = ({ progressMsg, fileName }) => {
  // 根据 progressMsg 推断当前步骤
  const stepIndex = progressMsg?.includes('OCR') || progressMsg?.includes('识别') ? 2
    : progressMsg?.includes('提取') || progressMsg?.includes('解析') ? 3
    : progressMsg?.includes('上传') ? 0
    : 1;

  return (
    <div className="flex flex-col items-center justify-center py-10 px-4 select-none">
      {/* 中心图标 + 扫描光圈 */}
      <div className="relative mb-8">
        {/* 外圈脉冲 */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FFD60A]/30 to-[#FF9F0A]/20 animate-ping" style={{ animationDuration: '1.8s' }} />
        {/* 中圈旋转 */}
        <div className="absolute -inset-3 rounded-full border-2 border-dashed border-[#FFD60A]/40 animate-spin" style={{ animationDuration: '4s' }} />
        {/* 内圈 */}
        <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-[#FFD60A] to-[#FF9F0A] flex items-center justify-center shadow-xl shadow-amber-200/60">
          {/* 扫描线 */}
          <div className="absolute inset-0 rounded-2xl overflow-hidden">
            <div className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-white/80 to-transparent animate-scan-line" />
          </div>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" className="text-white drop-shadow">
            <path d="M9 12h6M9 16h6M9 8h6M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </div>
      </div>

      {/* 文件名 */}
      {fileName && (
        <p className="text-[12px] text-gray-400 mb-5 max-w-[220px] truncate text-center">
          {fileName}
        </p>
      )}

      {/* 步骤进度条 */}
      <div className="w-full max-w-[280px] space-y-2.5 mb-6">
        {PARSE_STEPS.map((step, idx) => {
          const isDone = idx < stepIndex;
          const isActive = idx === stepIndex;
          return (
            <div key={step.key} className="flex items-center gap-3">
              {/* 状态图标 */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500
                ${isDone ? 'bg-gradient-to-br from-[#FFD60A] to-[#FF9F0A] shadow-sm shadow-amber-200/60'
                  : isActive ? 'bg-amber-50 border-2 border-[#FFD60A]'
                  : 'bg-gray-100 border border-gray-200'}`}>
                {isDone ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : isActive ? (
                  <div className="w-2 h-2 rounded-full bg-[#FF9F0A] animate-pulse" />
                ) : (
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                )}
              </div>
              {/* 步骤名 + 进度条 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[12px] font-medium transition-colors duration-300
                    ${isDone ? 'text-amber-500' : isActive ? 'text-gray-800' : 'text-gray-300'}`}>
                    {step.icon} {step.label}
                  </span>
                  {isDone && <span className="text-[10px] text-amber-400 font-medium">完成</span>}
                  {isActive && <span className="text-[10px] text-gray-400 animate-pulse">处理中…</span>}
                </div>
                {/* 进度条轨道 */}
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700
                    ${isDone ? 'w-full bg-gradient-to-r from-[#FFD60A] to-[#FF9F0A]'
                      : isActive ? 'bg-gradient-to-r from-[#FFD60A] to-[#FF9F0A] animate-progress-slide-bar'
                      : 'w-0'}`}
                    style={isDone ? {} : isActive ? { width: '60%' } : {}}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部进度文字 */}
      <p className="text-[12px] text-gray-400 text-center animate-pulse min-h-[18px]">
        {progressMsg || '正在连接解析服务…'}
      </p>
    </div>
  );
};

const DropZone = ({ dragging, onDragOver, onDragLeave, onDrop, onClick }) => (
  <div
    className={`relative rounded-3xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 border-2 border-dashed
      ${dragging
        ? 'border-[#FF9F0A] bg-amber-50/60 scale-[1.01] drop-pulse'
        : 'border-gray-200 bg-white/60 hover:border-[#FFD60A] hover:bg-amber-50/30'
      }`}
    onClick={onClick}
    onDragOver={onDragOver}
    onDragLeave={onDragLeave}
    onDrop={onDrop}
  >
    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FFD60A] to-[#FF9F0A] flex items-center justify-center mb-5 shadow-lg shadow-amber-200/60">
      <FileText size={28} className="text-white" strokeWidth={1.5} />
    </div>
    <p className="text-[16px] font-semibold text-gray-800 tracking-tight">
      拖拽 PDF 文件到此处
    </p>
    <p className="text-[13px] text-gray-400 mt-1.5 mb-5">
      支持 CRISPI SPORT Invoice 格式（含 OCR 识别）
    </p>
    <button className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-b from-[#FFD60A] to-[#FF9F0A] text-white text-[13px] font-medium shadow-md shadow-amber-200/60 hover:shadow-lg hover:shadow-amber-200/80 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200">
      <Upload size={13} strokeWidth={2.5} />
      选择文件
    </button>
  </div>
);

const UploadSection = forwardRef(({ onParsed, setParsing, parsing, setFileName, disableAnimation = false }, ref) => {
  const inputRef = useRef(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [dragging, setDragging] = useState(false);
  const [rawText, setRawText] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  // animPhase: 'idle' | 'throw' | 'done'
  const [animPhase, setAnimPhase] = useState('idle');
  // showAnim: 控制 GiftBoxAnimation 是否挂载（独立于 animPhase）
  const [showAnim, setShowAnim] = useState(false);
  const [currentFileName, setCurrentFileName] = useState('');
  // OCR 完成后设为 true，通知动画可以开始淡出
  const [resultReady, setResultReady] = useState(false);

  const parsedResultRef = useRef(null);

  // 动画内部完成数据回调（降落伞阶段结束时触发）
  const handleReadyForResult = useCallback(() => {
    // 如果 OCR 还没完成（parsedResultRef.current 仍为 null），
    // 轮询等待，直到 OCR 完成后再展示结果
    const tryShowResult = () => {
      const result = parsedResultRef.current;
      if (result === null) {
        // OCR 还在进行中，100ms 后再试
        setTimeout(tryShowResult, 100);
        return;
      }
      if (result?.data?.length > 0) {
        onParsed(result.data);
        setStatus('success');
      } else {
        onParsed([]);
        setStatus('error');
        setErrorMsg('未能识别到商品数据，请查看原始文本确认内容是否正确提取');
        if (result?.rawText) setShowRaw(true);
      }
      setParsing(false);
      setProgressMsg('');
      parsedResultRef.current = null;
      setAnimPhase('done');
    };
    tryShowResult();
  }, [onParsed, setParsing]);

  // 动画完全淡出后的回调（canvas 自己淡出完毕 → 卸载组件）
  const handleAnimationDone = useCallback(() => {
    setShowAnim(false);
    setAnimPhase('idle');
  }, []);

  // 同步给 GiftBoxAnimation 的 onAnimationDone 就是 handleAnimationDone

  // 暴露 demo 动画触发
  useImperativeHandle(ref, () => ({
    triggerDemoAnimation: () => {
      // 重置
      setShowAnim(false);
      setAnimPhase('idle');

      setTimeout(() => {
        parsedResultRef.current = {
          data: [
            { articleCode: '49803500', description: 'MONACO LEEDS GTX BEIGE', size: '42', qty: '3', price: '103.50' },
            { articleCode: '56603200', description: 'MONACO LOW GTX BEIGE', size: '41', qty: '1', price: '103.50' },
            { articleCode: '56606900', description: 'MONACO LOW GTX GRAFITE', size: '38', qty: '6', price: '103.50' },
          ],
          rawText: '',
        };
        setResultReady(true);  // demo 数据立即就绪
        setCurrentFileName('demo_invoice.pdf');
        setFileName('demo_invoice.pdf');
        setStatus('idle');
        setErrorMsg('');
        setParsing(true);
        setShowAnim(true);
        setAnimPhase('throw');
      }, 50);
    }
  }));

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith('.pdf')) {
      setStatus('error');
      setErrorMsg('请上传 PDF 格式文件');
      return;
    }
    parsedResultRef.current = null;
    setResultReady(false);  // 重置就绪状态
    setCurrentFileName(file.name);
    setFileName(file.name);
    setStatus('idle');
    setErrorMsg('');
    setRawText('');
    setShowRaw(false);
    setProgressMsg('');
    setParsing(true);
    // no=1 时跳过动画，直接解析
    if (!disableAnimation) {
      setShowAnim(true);
      setAnimPhase('throw');
    }

    try {
      const result = await parsePdfInvoice(file, (msg) => setProgressMsg(msg));
      setRawText(result.rawText || '');
      if (disableAnimation) {
        // 无动画模式：直接展示结果
        if (result?.data?.length > 0) {
          onParsed(result.data);
          setStatus('success');
        } else {
          onParsed([]);
          setStatus('error');
          setErrorMsg('未能识别到商品数据，请查看原始文本确认内容是否正确提取');
          if (result?.rawText) setShowRaw(true);
        }
        setParsing(false);
        setProgressMsg('');
      } else {
        parsedResultRef.current = result;
        setResultReady(true);  // 通知动画 OCR 已完成，可以开始淡出
      }
    } catch (e) {
      if (disableAnimation) {
        setStatus('error');
        setErrorMsg(e.message || '解析失败，请检查文件格式');
        setParsing(false);
        setProgressMsg('');
      } else {
        parsedResultRef.current = { data: [], rawText: '' };
        setResultReady(true);  // 即使失败也通知动画可以淡出
        setErrorMsg(e.message || '解析失败，请检查文件格式');
      }
    }
  };

  const onInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  // no=1 模式下是否正在解析（用于显示基础动画）
  const isSimpleParsing = disableAnimation && parsing;

  return (
    <div className="rounded-3xl bg-white/70 backdrop-blur-xl border border-white/80 shadow-xl shadow-gray-200/60 p-6">
      {/* 动画层：独立挂载，不受 animPhase 影响，只受 showAnim 控制 */}
      {showAnim && (
        <GiftBoxAnimation
          progressMsg={progressMsg}
          fileName={currentFileName}
          onReadyForResult={handleReadyForResult}
          onAnimationDone={handleAnimationDone}
          resultReady={resultReady}
        />
      )}

      {/* no=1 基础解析动画：替换 DropZone */}
      {isSimpleParsing ? (
        <ParseLoadingView progressMsg={progressMsg} fileName={currentFileName} />
      ) : (
        /* 上传区：始终渲染，动画时被遮罩覆盖 */
        <DropZone
          dragging={dragging}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => !showAnim && inputRef.current?.click()}
        />
      )}

      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={onInputChange} />

      {status === 'error' && !showAnim && (
        <div className="mt-4 flex items-center gap-2 text-red-500 text-sm bg-red-50 border border-red-100 px-4 py-2.5 rounded-2xl">
          <AlertCircle size={15} strokeWidth={2} /> {errorMsg}
        </div>
      )}

      {rawText && !showAnim && (
        <div className="mt-4">
          <button className="text-[12px] text-[#FF9F0A] font-medium" onClick={() => setShowRaw(v => !v)}>
            {showRaw ? '隐藏' : '查看'}原始提取文本
          </button>
          {showRaw && (
            <pre className="mt-2 p-4 bg-gray-50 border border-gray-100 rounded-2xl text-[11px] text-gray-500 max-h-60 overflow-auto whitespace-pre-wrap break-all leading-relaxed">
              {rawText || '（无内容）'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
});

export default UploadSection;
