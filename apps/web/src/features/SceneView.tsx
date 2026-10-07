import { lazy, Suspense, useState } from 'react';
import { Orbit } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { Agents } from './Agents.js';
import { useCachedSessions } from './character-session.js';
import { CharacterCommands } from './CharacterCommands.js';
import type { CharacterCommand } from './CharacterMenu.js';
import { SceneSummary } from './SceneSummary.js';
import { sceneSummary } from './scene-summary.js';
import { useSceneProps, type SceneViewProps } from './use-scene-props.js';

const OfficeScene = lazy(() =>
  import('@aether/office-scene').then((m) => ({ default: m.OfficeScene })),
);

/** The card that replaces the scene when the GPU took its WebGL context away: mount it again, or use the list. */
function ContextLostCard({ onReload }: { onReload: () => void }) {
  const t = useT();
  const prefs = usePreferences();
  return (
    <div className="scene-loading" role="alert">
      <Orbit size={32} />
      {t('sceneLost')}
      <div className="form-actions">
        <button className="primary" onClick={onReload}>
          {t('sceneReload')}
        </button>
        <button onClick={() => prefs.set({ view: '2d' })}>{t('sceneUseList')}</button>
      </div>
    </div>
  );
}

/** The office itself: the 3D scene (loaded when first shown) or, by choice or when WebGL fails, the 2D list. */
export function SceneView(props: SceneViewProps) {
  const { data, model, canWrite, onSelect, onRefresh } = props;
  const t = useT();
  const sessions = useCachedSessions();
  const prefs = usePreferences();
  const [command, setCommand] = useState<CharacterCommand | null>(null);
  // The GPU can take the WebGL context away (iOS, a backgrounded tab): the scene is replaced by a card with one tap to mount
  // it again (`epoch` is the scene's key, so it gets a new context) or to use the list; the 2D view is not forced on the user.
  const [contextLost, setContextLost] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const sceneProps = useSceneProps(props, sessions, setCommand);
  if (prefs.view !== '3d')
    return (
      <div className="office-2d">
        <Agents
          snapshot={{ ...data, agents: model.agents }}
          onSelect={onSelect}
          onSaved={onRefresh}
          canWrite={canWrite}
        />
      </div>
    );
  if (contextLost)
    return (
      <ContextLostCard
        onReload={() => {
          setContextLost(false);
          setEpoch((n) => n + 1);
        }}
      />
    );
  return (
    <Suspense
      fallback={
        <div className="scene-loading">
          <Orbit size={32} />
          {t('loading')}
        </div>
      }
    >
      <OfficeScene key={epoch} {...sceneProps} onContextLost={() => setContextLost(true)} />
      <SceneSummary text={sceneSummary(model.agents, model.floorOf, prefs.locale)} />
      <CharacterCommands
        command={command}
        sessions={sessions}
        locale={prefs.locale}
        onClose={() => setCommand(null)}
      />
    </Suspense>
  );
}
