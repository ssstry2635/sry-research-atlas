import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FlaskConical, X } from 'lucide-react';
import PluginApp from './PluginApp';

interface NativeInputActions {
  setDraft(text: string): void;
  submit(): void;
}

interface ConversationDockProps {
  inputActions?: NativeInputActions;
  input?: { draft?: string; phase?: string };
  sessionId?: string;
}

type PopoverElement = HTMLElement & { showPopover: () => void; hidePopover: () => void };

type ResizeDirection = 'ne' | 'nw' | 'se' | 'sw';
type MoveDirection = 'n' | 'e' | 's' | 'w';
const resizeDirections: ResizeDirection[] = ['ne', 'nw', 'se', 'sw'];
const moveDirections: MoveDirection[] = ['n', 'e', 's', 'w'];

export function ConversationDock({ inputActions, input }: ConversationDockProps) {
  const [expanded, setExpanded] = useState(false);
  const [sendError, setSendError] = useState('');
  const [geometry, setGeometry] = useState(() => ({
    left: Math.max(8, window.innerWidth - 982),
    top: 72,
    width: Math.min(960, window.innerWidth - 24),
    height: Math.min(680, window.innerHeight - 120),
  }));
  const popoverRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ direction: ResizeDirection; x: number; y: number; left: number; top: number; width: number; height: number } | null>(null);
  const moveRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  useEffect(() => {
    const element = popoverRef.current as PopoverElement | null;
    if (!element) return;
    if (!element.hasAttribute('popover')) element.setAttribute('popover', 'manual');
    const supportsPopover = typeof (element as unknown as { showPopover?: unknown }).showPopover === 'function';
    if (expanded) {
      if (supportsPopover) {
        if (!element.matches(':popover-open')) element.showPopover();
      } else {
        element.style.display = 'flex';
      }
    } else if (supportsPopover) {
      if (element.matches(':popover-open')) element.hidePopover();
    } else {
      element.style.display = 'none';
    }
  }, [expanded]);

  const toggle = () => { setSendError(''); setExpanded((current) => !current); };
  const askNative = (prompt: string) => {
    setSendError('');
    if (!inputActions) {
      setSendError('无法连接 DSH 原生输入框，请刷新页面后重试。');
      setExpanded(true);
      return;
    }
    try {
      const existing = input?.draft?.trim();
      inputActions.setDraft(existing ? `${existing}\n\n${prompt}` : prompt);
      setExpanded(false);
      window.setTimeout(() => {
        try { inputActions.submit(); }
        catch (error) { setSendError(error instanceof Error ? error.message : 'DSH 原生对话提交失败'); }
      }, 120);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : '无法写入 DSH 原生输入框');
      setExpanded(true);
    }
  };
  const startResize = (event: React.PointerEvent, direction: ResizeDirection) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { direction, x: event.clientX, y: event.clientY, ...geometry };
  };
  const moveResize = (event: React.PointerEvent) => {
    const start = resizeRef.current;
    if (!start) return;
    let left = start.left; let top = start.top; let width = start.width; let height = start.height;
    const dx = event.clientX - start.x; const dy = event.clientY - start.y;
    if (start.direction.includes('e')) width = Math.max(620, start.width + dx);
    if (start.direction.includes('w')) { width = Math.max(620, start.width - dx); left = start.left + start.width - width; }
    if (start.direction.includes('s')) height = Math.max(420, start.height + dy);
    if (start.direction.includes('n')) { height = Math.max(420, start.height - dy); top = start.top + start.height - height; }
    width = Math.min(width, window.innerWidth - 16); height = Math.min(height, window.innerHeight - 16);
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    setGeometry({ left, top, width, height });
  };
  const endResize = (event: React.PointerEvent) => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const startMove = (event: React.PointerEvent) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveRef.current = { x: event.clientX, y: event.clientY, left: geometry.left, top: geometry.top };
  };
  const moveWindow = (event: React.PointerEvent) => {
    const start = moveRef.current;
    if (!start) return;
    setGeometry({
      ...geometry,
      left: Math.max(8, Math.min(window.innerWidth - geometry.width - 8, start.left + event.clientX - start.x)),
      top: Math.max(8, Math.min(window.innerHeight - geometry.height - 8, start.top + event.clientY - start.y)),
    });
  };
  const endMove = (event: React.PointerEvent) => {
    moveRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <section className="bohr-conversation-dock">
    <header>
      <button className="bohr-conversation-toggle" onClick={toggle} aria-expanded={expanded}><FlaskConical size={15} /><strong>SRY Research Atlas</strong><span>{sendError || '左右分支 · 论文证据 · 拖卡交给下方原生对话'}</span></button>
      <button className="bohr-conversation-chevron" onClick={toggle} aria-label={expanded ? '收起 SRY Research Atlas' : '展开 SRY Research Atlas'}><ChevronDown className={expanded ? 'rotated' : ''} size={16} /></button>
    </header>
    <div ref={popoverRef} className="bohr-floating-window" data-bohr-float style={{ left: geometry.left, top: geometry.top, width: geometry.width, height: geometry.height }}>
      <header>
        <span><FlaskConical size={16} /><strong>SRY Research Atlas</strong><em>边缘拖动位置 · 四角缩放 · 原生对话保持可用</em></span>
        <button onClick={() => setExpanded(false)} aria-label="关闭 SRY Research Atlas 窗口"><X size={17} /></button>
      </header>
      {expanded && <div className="bohr-floating-body"><PluginApp embedded askNative={askNative} /></div>}
      {moveDirections.map((direction) => <div key={direction} className={`bohr-window-edge dir-${direction}`} role="button" tabIndex={-1} aria-label={`拖动${direction}边框移动窗口`} onPointerDown={startMove} onPointerMove={moveWindow} onPointerUp={endMove} />)}
      {resizeDirections.map((direction) => <div key={direction} className={`bohr-window-resize dir-${direction}`} role="separator" aria-label={`从${direction}方向缩放窗口`} onPointerDown={(event) => startResize(event, direction)} onPointerMove={moveResize} onPointerUp={endResize} />)}
    </div>
  </section>;
}
