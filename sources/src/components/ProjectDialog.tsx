import { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { ProjectContext } from '../types';

interface ProjectDialogProps { project: ProjectContext; onSave: (project: ProjectContext) => void; onClose: () => void; }

export function ProjectDialog({ project, onSave, onClose }: ProjectDialogProps) {
  const [draft, setDraft] = useState(project);
  const dialogRef = useFocusTrap(onClose, 'input');
  const update = (field: keyof ProjectContext, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); onSave(draft); };
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className="modal project-dialog" role="dialog" aria-modal="true" aria-labelledby="project-dialog-title">
    <header><span className="modal-icon"><FlaskConical size={20} /></span><div><span className="section-kicker">让推荐理解你的真实处境</span><h2 id="project-dialog-title">更新课题进展</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
    <form onSubmit={submit}><div className="form-grid"><label>课题名称<input required value={draft.title} onChange={(e) => update('title', e.target.value)} /></label><label>目标材料或体系<input required value={draft.target} onChange={(e) => update('target', e.target.value)} /></label></div>
      <label>当前阶段<input required value={draft.stage} onChange={(e) => update('stage', e.target.value)} placeholder="例如：已复现合成，正在优化配体" /></label>
      <label>已经做到哪里？<textarea required rows={3} value={draft.progress} onChange={(e) => update('progress', e.target.value)} placeholder="记录已有结果、异常现象与尚未解决的问题" /></label>
      <label>希望达成什么？<textarea required rows={3} value={draft.goal} onChange={(e) => update('goal', e.target.value)} /></label>
      <label>实验约束与偏好<textarea required rows={3} value={draft.constraints} onChange={(e) => update('constraints', e.target.value)} placeholder="例如：时间、设备、溶剂、安全、成本限制" /></label>
      <p className="form-note">这些信息仅保存在当前浏览器中。方向匹配由可解释规则计算，不会上传到外部服务。</p>
      <footer><button type="button" className="secondary-action" onClick={onClose}>取消</button><button type="submit" className="primary-action">保存并更新推荐</button></footer>
    </form>
  </section></div>;
}
