import React from 'react';
import PluginApp from './PluginApp';
import { ConversationDock } from './ConversationDock';
import pluginStyles from './plugin.css';

interface ClientContext {
  get(name: string): any;
  effect(callback: () => void | (() => void), label?: string): void;
  slots: {
    inject(name: string, callback: () => void | (() => void)): () => void;
    register(options: Record<string, unknown>, component: React.ComponentType<any>): () => void;
  };
}

export function apply(ctx: ClientContext) {
  const h = React.createElement;
  let translate = (key: string) => key === 'panel' ? '玻尔科学空间' : key;
  const locale = ctx.get('locale');
  if (locale) {
    ctx.effect(() => locale.register('bohr-atlas', 'en', { panel: 'Bohr research atlas' }), 'bohr locale en');
    ctx.effect(() => locale.register('bohr-atlas', 'zh-CN', { panel: '玻尔科学空间' }), 'bohr locale zh-CN');
    translate = locale.bind('bohr-atlas');
  }

  function PanelIcon({ size = 20 }: { size?: number }) {
    return h('svg', { width: size, height: size, viewBox: '0 0 32 32', fill: 'none', 'aria-hidden': true },
      h('ellipse', { cx: 16, cy: 16, rx: 13, ry: 5, stroke: 'currentColor', strokeWidth: 1.5, transform: 'rotate(45 16 16)' }),
      h('ellipse', { cx: 16, cy: 16, rx: 13, ry: 5, stroke: 'currentColor', strokeWidth: 1.5, transform: 'rotate(-45 16 16)' }),
      h('circle', { cx: 16, cy: 16, r: 2.5, fill: 'currentColor' }));
  }

  function BohrPage() {
    return h(React.Fragment, null,
      h('style', null, pluginStyles),
      h(PluginApp));
  }

  function BohrConversationDock(props: Record<string, unknown>) {
    return h(React.Fragment, null,
      h('style', null, pluginStyles),
      h(ConversationDock, props));
  }

  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register({ name: 'sidebar.panellist', id: 'bohr-atlas', order: 20, label: () => translate('panel') }, PanelIcon)
  ), 'bohr panel entry');
  ctx.effect(() => ctx.slots.inject('main', () =>
    ctx.slots.register({ name: 'main', key: 'bohr-atlas' }, BohrPage)
  ), 'bohr main panel');
  ctx.effect(() => ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register({ name: 'conversation.input.dock', id: 'bohr-workspace', order: 15, label: () => translate('panel') }, BohrConversationDock)
  ), 'bohr conversation workspace');
}
