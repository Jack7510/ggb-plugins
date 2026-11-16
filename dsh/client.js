/** @fileoverview Browser half of the GeoGebra delivery card. */
const box = {
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 10,
  background: 'var(--dsw-alias-bg-layer-1)',
  color: 'var(--dsw-alias-label-primary)',
  padding: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const header = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
};
const title = {
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
const muted = {
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  overflowWrap: 'anywhere',
};
const counts = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
};
const countCell = {
  border: '1px solid var(--dsw-alias-border-l1)',
  borderRadius: 8,
  padding: '6px 8px',
  background: 'var(--dsw-alias-bg-layer-2)',
};
const countValue = { fontSize: 18, fontWeight: 600, lineHeight: 1.3 };
const buttonStyle = {
  border: '1px solid var(--dsw-alias-border-l2)',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-primary)',
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
};
const previewBox = {
  minHeight: 72,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  background: 'var(--dsw-alias-bg-layer-2)',
  color: 'var(--dsw-alias-label-secondary)',
  fontSize: 12,
  padding: 8,
};
const css = `
[data-ggb-card] button:hover { border-color: var(--dsw-alias-brand-primary); }
[data-ggb-card] button:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
[data-ggb-card] button:disabled { opacity: .55; cursor: default; }
`;

window.__ModuleLoader__.load({
  id: 'ggb-plugins-dsh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const dicts = {
      zh: {
        title: 'GeoGebra 交付',
        verified: '全部通过',
        failed: '需要修复',
        unverified: '未验证',
        passed: '通过',
        failedStatus: '失败',
        notSampled: '无交互样本',
        construction: '构造',
        reload: '重载',
        interaction: '交互',
        noFailures: '没有失败条件；有限样本不构成数学证明。',
        failures: '失败条件',
        more: '另有 {count} 条未显示',
        openPreview: '在浏览器打开交互预览',
        opening: '正在打开…',
        previewOpened: '已在系统浏览器打开',
        openReport: '打开报告',
        openGgb: '打开 GGB',
        previewLoading: '预览加载中…',
        previewFailed: '缩略图不可用',
        previewMissing: '没有 preview.png',
        noCard: '正在读取交付…',
        unknown: '无法读取交付摘要。',
        retryHint: '请让 Agent 检查交付目录后重新调用。',
      },
      en: {
        title: 'GeoGebra delivery',
        verified: 'All checks passed',
        failed: 'Needs repair',
        unverified: 'Unverified',
        passed: 'Passed',
        failedStatus: 'Failed',
        notSampled: 'No interaction samples',
        construction: 'Construction',
        reload: 'Reload',
        interaction: 'Interaction',
        noFailures: 'No failed condition. Finite samples are not a proof.',
        failures: 'Failed conditions',
        more: '{count} more not shown',
        openPreview: 'Open preview in browser',
        opening: 'Opening…',
        previewOpened: 'Opened in the system browser',
        openReport: 'Open report',
        openGgb: 'Open GGB',
        previewLoading: 'Loading preview…',
        previewFailed: 'Thumbnail unavailable',
        previewMissing: 'No preview.png',
        noCard: 'Reading the delivery…',
        unknown: 'Cannot read the delivery summary.',
        retryHint: 'Ask the agent to check the delivery and call the tool again.',
      },
    };
    const text = (block) => Array.isArray(block?.content)
      ? block.content.filter(item => item.type === 'text')
        .map(item => item.text).join('\n')
      : '';
    const strip = (raw) => raw
      .replace(/^BEGIN_UNTRUSTED_REFERENCE_DATA\n/u, '')
      .replace(/\nEND_UNTRUSTED_REFERENCE_DATA[\s\S]*$/u, '');
    const parse = (props) => {
      if (props.phase !== 'result') return null;
      try { return JSON.parse(strip(text(props.block))); } catch { return null; }
    };
    const summaryOf = (data) => {
      if (data?.phases) return data;
      const summary = data?.receipt?.verification?.summary;
      if (!summary) {
        const issues = data?.receipt?.issues
          ?? (data?.error
            ? [{ code: data.error.code, message: data.error.message }]
            : []);
        return {
          ...data,
          verified: false,
          phases: {
            construction: { status: 'unverified', total: 0, passed: 0, failed: 0, unverified: 0 },
            reload: { status: 'unverified', total: 0, passed: 0, failed: 0, unverified: 0 },
            interaction: { status: 'unverified', total: 0, passed: 0, failed: 0, unverified: 0 },
          },
          failures: issues.map(issue => ({
            phase: 'build', requirementId: '', checkId: issue.code ?? '',
            method: '', status: 'failed', reason: issue.message ?? '',
          })),
          failureTotal: issues.length,
        };
      }
      const phase = value => ({
        status: value?.status ?? 'unverified',
        total: value?.results ?? 0,
        passed: value?.passed ?? 0,
        failed: value?.failed ?? 0,
        unverified: value?.unverified ?? 0,
      });
      return {
        ...data,
        verified: data.receipt.status === 'succeeded',
        phases: {
          construction: phase(summary.construction),
          reload: phase(summary.reload),
          interaction: phase(summary.interaction),
        },
        failures: (data.receipt.issues ?? []).map(issue => ({
          phase: 'build', requirementId: '', checkId: issue.code ?? '',
          method: '', status: 'failed', reason: issue.message ?? '',
        })),
      };
    };
    const count = (value) => `${value?.passed ?? 0}/${value?.total ?? 0}`;
    const statusLabel = (value, t) => {
      if (value?.status === 'passed') return t('passed');
      if (value?.status === 'failed' || (value?.failed ?? 0) > 0) return t('failedStatus');
      if (value?.status === 'not_sampled') return t('notSampled');
      return t('unverified');
    };
    const statusColor = (value) => {
      if (value?.status === 'passed') return 'var(--dsw-alias-state-success-primary)';
      if (value?.status === 'failed' || (value?.failed ?? 0) > 0) {
        return 'var(--dsw-alias-state-error-primary)';
      }
      return 'var(--dsw-alias-state-warn-primary)';
    };
    const badge = (card, t) => {
      if (card.verified) {
        return { label: t('verified'), color: 'var(--dsw-alias-state-success-primary)' };
      }
      const failed = ['construction', 'reload', 'interaction']
        .some(key => (card.phases?.[key]?.failed ?? 0) > 0);
      return failed
        ? { label: t('failed'), color: 'var(--dsw-alias-state-error-primary)' }
        : { label: t('unverified'), color: 'var(--dsw-alias-state-warn-primary)' };
    };
    const displayPath = (path, props) => {
      if (typeof path !== 'string' || path === '') return '';
      if (typeof props.home === 'string' && path.startsWith(props.home)) {
        return `~${path.slice(props.home.length)}`;
      }
      if (typeof props.cwd === 'string' && path.startsWith(props.cwd)) {
        return path.slice(props.cwd.length).replace(/^[\\/]+/u, '') || '.';
      }
      return path;
    };
    function CardHeader({ data, status, t, props }) {
      return h('div', { style: header },
        h('div', { style: { minWidth: 0 } },
          h('div', { style: title }, data.title ?? t('title')),
          h('div', { style: muted }, displayPath(data.delivery, props))),
        h('span', {
          style: { color: status.color, fontWeight: 600, whiteSpace: 'nowrap' },
        }, status.label));
    }
    function Preview({ state, url, error, t, titleText }) {
      if (state === 'loading') {
        return h('div', { style: previewBox }, t('previewLoading'));
      }
      if (state === 'error' || error) {
        return h('div', { style: { ...previewBox, color: 'var(--dsw-alias-state-warn-primary)' } },
          error || t('previewFailed'));
      }
      if (state === 'missing') return h('div', { style: previewBox }, t('previewMissing'));
      if (url === null) return null;
      return h('img', {
        src: url, alt: `${t('title')}: ${titleText}`,
        style: {
          width: '100%', maxHeight: 220, objectFit: 'contain',
          borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)',
        },
      });
    }
    function PhaseGrid({ phases, t }) {
      return h('div', { style: counts, role: 'group', 'aria-label': t('title') },
        [[t('construction'), phases?.construction],
          [t('reload'), phases?.reload],
          [t('interaction'), phases?.interaction]].map(([label, value]) =>
          h('div', { key: label, style: countCell },
            h('div', { style: muted }, label),
            h('div', { style: countValue }, count(value)),
            h('div', { style: { ...muted, color: statusColor(value) } },
              statusLabel(value, t)))));
    }
    function FailureList({ failures, total, t }) {
      if (failures.length === 0) {
        return h('div', {
          style: { ...muted, color: 'var(--dsw-alias-state-success-primary)' },
        }, t('noFailures'));
      }
      const shown = failures.slice(0, 8);
      return h('div', null,
        h('div', {
          role: 'heading', 'aria-level': 3,
          style: { ...muted, marginTop: 10, fontWeight: 600 },
        }, t('failures')),
        h('ul', { style: { margin: '4px 0 0', paddingLeft: 18 } },
          shown.map((failure, index) =>
            h('li', { key: `${failure.phase}-${failure.checkId}-${index}`,
              style: { margin: '2px 0', overflowWrap: 'anywhere' } },
            `${failure.phase} · ${failure.checkId || '-'}: `
              + `${failure.reason || failure.status}`))),
        total > shown.length
          ? h('div', { style: muted }, t('more', { count: total - shown.length }))
          : null);
    }
    function Actions({ data, state, onPreview, t, openFile }) {
      const button = (label, onClick, disabled = false) => h('button', {
        type: 'button', onClick, disabled, style: buttonStyle,
      }, label);
      return h('div', {
        style: { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 },
      },
      data.delivery === undefined ? null : button(
        state === 'opening' ? t('opening') : t('openPreview'),
        onPreview, state === 'opening'),
      data.report === undefined ? null : button(t('openReport'),
        () => openFile(data.report)),
      data.ggb === undefined || data.ggb === null ? null : button(t('openGgb'),
        () => openFile(data.ggb)));
    }
    function usePreview(data, props) {
      const [preview, setPreview] = React.useState(null);
      const [previewState, setPreviewState] = React.useState('idle');
      const [previewError, setPreviewError] = React.useState('');
      const previewId = data?.preview?.attachmentId;
      React.useEffect(() => {
        let alive = true;
        setPreview(null);
        setPreviewError('');
        if (!previewId || typeof props.loadImage !== 'function') {
          setPreviewState(data?.previewPath === null ? 'missing' : 'idle');
          return undefined;
        }
        setPreviewState('loading');
        props.loadImage(data.preview).then(url => {
          if (alive) { setPreview(url); setPreviewState('ready'); }
        }).catch(error => {
          if (alive) {
            setPreviewState('error');
            setPreviewError(error instanceof Error ? error.message : String(error));
          }
        });
        return () => { alive = false; };
      }, [previewId, data?.previewPath, props.loadImage]);
      return { preview, previewState, previewError };
    }
    function usePreviewAction(data, props, t) {
      const [state, setState] = React.useState('idle');
      const [message, setMessage] = React.useState('');
      React.useEffect(() => {
        setState('idle');
        setMessage('');
      }, [data?.delivery]);
      const openPreview = async () => {
        if (!data?.delivery
          || typeof props.remote?.commands?.execute !== 'function') return;
        setState('opening');
        setMessage('');
        try {
          const line = `/ggb-preview ${JSON.stringify(data.delivery)}`;
          const result = await props.remote.commands.execute(props.sessionId, line, []);
          if (result?.ok !== true || result.value === undefined) {
            throw new Error(result?.error?.message ?? 'preview command unavailable');
          }
          const outcome = result.value.result;
          if (outcome?.kind === 'error') {
            throw new Error(outcome.text ?? 'preview failed');
          }
          setState('opened');
          setMessage(t('previewOpened'));
        } catch (error) {
          setState('error');
          setMessage(error instanceof Error ? error.message : String(error));
        }
      };
      return { state, message, openPreview };
    }
    function Card(props) {
      const t = props.t;
      const data = summaryOf(parse(props));
      const preview = usePreview(data, props);
      const action = usePreviewAction(data, props, t);
      if (props.phase === 'preparing' || props.phase === 'start') {
        return h('div', { style: box }, h('div', { style: muted }, t('noCard')));
      }
      if (!data) {
        const raw = strip(text(props.block)).slice(0, 300);
        const error = props.block?.error?.message ?? props.block?.error?.code;
        return h('div', { style: box, role: 'alert' },
          h('div', { style: muted }, t('unknown')),
          error || raw ? h('div', { style: muted }, error || raw) : null,
          h('div', { style: muted }, t('retryHint')));
      }
      const status = badge(data, t);
      return h('div', {
        style: box, 'data-ggb-card': '', 'aria-busy': action.state === 'opening',
      },
      h('style', null, css),
      h(CardHeader, { data, status, t, props }),
      h(Preview, {
        state: preview.previewState, url: preview.preview,
        error: preview.previewError || data.previewError,
        t, titleText: data.title ?? t('title'),
      }),
      h(PhaseGrid, { phases: data.phases, t }),
      h(FailureList, {
        failures: data.failures ?? [],
        total: data.failureTotal ?? (data.failures ?? []).length,
        t,
      }),
      h(Actions, {
        data, state: action.state, onPreview: action.openPreview,
        t, openFile: props.openFile,
      }),
      action.message === ''
        ? null
        : h('div', {
          role: action.state === 'error' ? 'alert' : 'status',
          style: { ...muted, marginTop: 6,
            color: action.state === 'error'
              ? 'var(--dsw-alias-state-error-primary)'
              : 'var(--dsw-alias-label-secondary)' },
        }, action.message));
    }
    return {
      inject: ['slots', 'locale', 'remote', 'remote.commands'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('ggbCard', 'zh', dicts.zh));
        ctx.effect(() => ctx.locale.register('ggbCard', 'en', dicts.en));
        const t = ctx.locale.bind('ggbCard');
        const ToolCard = props => h(Card, { ...props, t, remote: ctx.remote });
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview', key: 'ggb_delivery', locale: 'ggbCard',
        }, ToolCard));
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview', key: 'ggb_build', locale: 'ggbCard',
        }, ToolCard));
      },
    };
  },
});
