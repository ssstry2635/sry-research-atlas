import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, FlaskConical, LoaderCircle, Mic, MicOff, Search, X } from 'lucide-react';
import { commonElements, convertSelection, formatChemicalFormula, formulaToSearchQuery, recognizeChemicalSpeech, type ChemicalSpeechResult } from '../lib/chemistry';

interface SpeechResultAlternativeLike { transcript: string }
interface SpeechResultEventLike {
  resultIndex: number;
  results: Array<{ isFinal: boolean; 0: SpeechResultAlternativeLike }>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface ChemicalSearchFormProps {
  loading: boolean;
  onSearch: (query: string) => void;
}

export function ChemicalSearchForm({ loading, onSearch }: ChemicalSearchFormProps) {
  const [value, setValue] = useState('');
  const [helperOpen, setHelperOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<'zh-CN' | 'en-US'>('zh-CN');
  const [interim, setInterim] = useState('');
  const [speechResult, setSpeechResult] = useState<ChemicalSpeechResult | null>(null);
  const [notice, setNotice] = useState('可输入 CsPbBr3，或点击麦克风说出“铯铅溴三”。');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const preview = value ? formatChemicalFormula(value) : '';

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setHelperOpen(false);
    };
    const focusShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        event.preventDefault(); inputRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', focusShortcut);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', focusShortcut);
      recognitionRef.current?.abort();
    };
  }, []);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!value.trim() || loading) return;
    const formatted = formatChemicalFormula(value);
    setValue(formatted);
    setHelperOpen(false);
    onSearch(formulaToSearchQuery(formatted));
  };

  const convert = (mode: 'subscript' | 'superscript') => {
    const input = inputRef.current;
    if (!input || input.selectionStart === input.selectionEnd) {
      setNotice('先在输入框中选中要转换的数字或电荷，再点击上下标。');
      setHelperOpen(true);
      return;
    }
    const converted = convertSelection(value, input.selectionStart!, input.selectionEnd!, mode);
    setValue(converted);
    setNotice(mode === 'subscript' ? '已将选中内容转换为下标。' : '已将选中内容转换为上标。');
    input.focus();
  };

  const insert = (text: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    setValue(next);
    window.setTimeout(() => { input?.focus(); input?.setSelectionRange(start + text.length, start + text.length); }, 0);
  };

  const toggleListening = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    if (!window.isSecureContext) { setNotice('语音识别需要 HTTPS 或可信 localhost 地址，请改用文本输入。'); setHelperOpen(true); return; }
    const speechWindow = window as typeof window & { SpeechRecognition?: SpeechRecognitionConstructor; webkitSpeechRecognition?: SpeechRecognitionConstructor };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) { setNotice('当前宿主未提供 Web Speech 语音识别，请使用文本与上下标工具。'); setHelperOpen(true); return; }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = speechLang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interimTranscript += result[0].transcript;
      }
      setInterim(interimTranscript);
      if (finalTranscript) {
        const parsed = recognizeChemicalSpeech(finalTranscript);
        setSpeechResult(parsed);
        setValue(parsed.formatted);
        setNotice(parsed.confident ? '已生成化学式候选，请核对排版与查询文本后检索。' : '未能完整确认化学式，请手动编辑候选内容。');
        setHelperOpen(true);
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        'not-allowed': '麦克风权限未开启，请在宿主中允许后重试。',
        'service-not-allowed': '当前语音服务不可用，请改用文本输入。',
        'audio-capture': '没有检测到可用麦克风，请检查输入设备。',
        network: '语音服务网络连接失败，请改用文本输入。',
        'no-speech': '没有听到清晰语音，可以靠近麦克风后重试。',
      };
      setNotice(messages[event.error] || '语音识别未完成，请改用文本输入。');
      setHelperOpen(true);
    };
    recognition.onend = () => { setListening(false); setInterim(''); };
    try {
      setSpeechResult(null); setInterim(''); setListening(true); setHelperOpen(true);
      setNotice('正在聆听。浏览器可能使用在线语音服务，说完后会自动生成候选。');
      recognition.start();
    } catch {
      setListening(false);
      setNotice('语音识别无法启动，请检查宿主权限或改用文本输入。');
    }
  };

  return <div className="chem-search" ref={wrapperRef}>
    <form className={listening ? 'bd-search listening' : 'bd-search'} role="search" onSubmit={submit}>
      {loading ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}
      <input ref={inputRef} value={value} onChange={(event) => { setValue(event.target.value); setSpeechResult(null); }} onFocus={() => setHelperOpen(true)} placeholder="输入化学式、材料、方法或论文…" aria-label="输入化学式、材料、方法或论文" />
      <button type="button" className="chem-tool-trigger" onClick={() => setHelperOpen((open) => !open)} aria-label="化学式输入助手" aria-expanded={helperOpen}>x₂<ChevronDown size={12} /></button>
      <button type="button" className={listening ? 'voice-trigger active' : 'voice-trigger'} onClick={toggleListening} aria-label={listening ? '停止语音输入' : '开始语音输入'} title="语音输入化学式">{listening ? <MicOff size={16} /> : <Mic size={16} />}</button>
      <button type="submit" disabled={loading || !value.trim()}>{loading ? '检索中' : '发散检索'}</button>
    </form>
    {helperOpen && <div className="chem-helper">
      <header><span><FlaskConical size={15} />化学式输入助手</span><div className="chem-helper-actions"><button onClick={() => setSpeechLang((lang) => lang === 'zh-CN' ? 'en-US' : 'zh-CN')} aria-label="切换语音识别语言">{speechLang === 'zh-CN' ? '中文' : 'EN'}</button><button onClick={() => setHelperOpen(false)} aria-label="关闭输入助手"><X size={14} /></button></div></header>
      <div className="chem-preview"><span>排版预览</span><strong>{preview || '等待输入化学式'}</strong>{preview && <small>检索文本：{formulaToSearchQuery(preview)}</small>}</div>
      <div className="chem-edit-tools"><button onClick={() => convert('subscript')}>下标<span>x₂</span></button><button onClick={() => convert('superscript')}>上标<span>x²</span></button><button onClick={() => insert('·')}>水合点<span>·</span></button><button onClick={() => insert('^')}>电荷标记<span>^</span></button></div>
      <div className="chem-elements">{commonElements.map((element) => <button key={element} onClick={() => insert(element)}>{element}</button>)}</div>
      {speechResult && <div className={speechResult.confident ? 'speech-review confirmed' : 'speech-review'}><span>原始语音：{speechResult.transcript}</span><strong>{speechResult.formatted}</strong><small>{speechResult.confident ? `将查询 ${speechResult.query}。点击“发散检索”确认。` : '解析不完整，请直接在输入框中修改。'}</small>{speechResult.confident && <Check size={15} />}</div>}
      {interim && <p className="voice-interim">正在识别：{interim}</p>}
      <p className="chem-notice" role="status">{notice}</p>
    </div>}
  </div>;
}
