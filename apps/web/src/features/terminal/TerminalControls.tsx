import { Field } from '../../ui/Field.js';
import { useT, useWhy } from '../../ui/useT.js';
import type { TerminalAct, TerminalDetail } from './terminal-model.js';

type Props = {
  canWrite: boolean;
  writable: boolean;
  data: TerminalDetail | undefined;
  act: TerminalAct;
};

function TerminalButtons({ canWrite, data, act }: Props) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <div className="form-actions">
      <button
        className="danger"
        disabled={!canWrite || !data || data.state === 'exited'}
        {...whyNot(
          [canWrite, 'needOperator'],
          [!!data && data.state !== 'exited', 'whyTerminalNotRunning'],
        )}
        onClick={() => void act('terminal.stop')}
      >
        {t('terminalStop')}
      </button>
    </div>
  );
}

function ResizeForm({ canWrite, writable, act }: Omit<Props, 'data'>) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <form
      className="field-row"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void act('terminal.resize', {
          cols: Number(form.get('cols')),
          rows: Number(form.get('rows')),
        });
      }}
    >
      <Field label={t('terminalCols')}>
        <input name="cols" type="number" defaultValue={80} min={10} max={400} required />
      </Field>
      <Field label={t('terminalRows')}>
        <input name="rows" type="number" defaultValue={24} min={2} max={200} required />
      </Field>
      <button
        disabled={!writable}
        {...whyNot([canWrite, 'needOperator'], [writable, 'whyTerminalNotHeld'])}
      >
        {t('terminalResize')}
      </button>
    </form>
  );
}

export function TerminalControls(props: Props) {
  return (
    <>
      <TerminalButtons {...props} />
      <ResizeForm canWrite={props.canWrite} writable={props.writable} act={props.act} />
    </>
  );
}
