import type { SceneModel } from '../core/use-scene-model.js';
import { floorZones } from '../environment/layout.js';
import { compactionLabel } from '../environment/compaction-label.js';
import { NameTag, tipOf } from './NameTag.js';
import { SpeechLayer } from './Speech.js';
import { StalkTooltip } from './StalkTooltip.js';
import { CompactHud } from './CompactHud.js';
import { BuildingPanel, FloorHud, ShotCaption } from './SceneHud.js';
import { FloorPlaque } from './FloorKpi.js';
import { departmentAt, floorOfDesk, floorY, ZONE_OFFSET } from '../scene/scene-geometry.js';
import { SquadDom } from '../squad/index.js';

const registerIn = (nodes: Map<string, HTMLElement>, id: string) => (node: HTMLElement | null) => {
  if (node) nodes.set(id, node);
  else nodes.delete(id);
};

function NameTags({ m }: { m: SceneModel }) {
  const { props, nav, hovered, layout } = m;
  const { marks, seatDrag, words } = m.ix;
  return m.sceneAgents.filter(m.named).map((agent) => (
    <NameTag
      key={agent.id}
      agent={agent}
      provider={props.screens?.[agent.id]?.provider}
      context={props.screens?.[agent.id]?.contextPercent ?? null}
      selected={agent.id === props.selectedId}
      hovered={agent.id === hovered}
      grouped={marks.group.has(agent.id)}
      menuOpen={agent.id === marks.menuId}
      label={`${props.names?.[agent.id]?.title ?? agent.name}, ${m.roleName(agent)}, ${words.state[agent.activity]}`}
      tip={tipOf(agent, props.names?.[agent.id])}
      accent={departmentAt(floorOfDesk(layout, agent.id)).accent}
      still={!!props.reducedMotion}
      unread={props.unreadIds?.has(agent.id) ?? false}
      meta={
        agent.id === hovered || agent.id === props.selectedId || m.onShot(agent.id)
          ? [props.names?.[agent.id]?.repo, m.roleName(agent), props.doing?.[agent.id]].filter(
              (part): part is string => !!part,
            )
          : null
      }
      setElement={(node) => registerIn(m.elements.current, agent.id)(node)}
      onPointerDown={nav.pause}
      onActivate={(how) => {
        if (!seatDrag.justEnded()) marks.activate(agent.id, how);
      }}
      onMenu={() => marks.openMenu(agent.id)}
      onGrab={(event) => seatDrag.grab(agent.id, event)}
      onHover={(on) => (on ? m.hoverStart(agent.id) : m.hoverEnd(agent.id))}
    />
  ));
}

function CompactionChips({ m }: { m: SceneModel }) {
  const { props, zh } = m;
  return m.chipped.map((agent) => {
    const compaction = props.compactions?.[agent.id];
    if (!compaction) return null;
    return (
      <span
        key={`${agent.id}:${compaction.key}`}
        ref={registerIn(m.chipElements.current, agent.id)}
        className="compact-chip"
        role="status"
      >
        {compactionLabel(compaction, zh)}
      </span>
    );
  });
}

function ZoneLabels({ m }: { m: SceneModel }) {
  const { floor, exploded, zh } = m;
  if ((m.compact && !m.namesOn) || exploded) return null;
  return floorZones(floor)
    .filter((z) => z.id !== 'atrium')
    .map((zone) => (
      <button
        className="zone-label"
        key={zone.id}
        tabIndex={-1}
        ref={registerIn(m.elements.current, zone.id)}
        onClick={() => m.nav.fly([zone.x, floorY(floor, exploded), zone.z], ZONE_OFFSET)}
      >
        {zh ? zone.zh : zone.en}
      </button>
    ));
}

export function WorldLabels({ m }: { m: SceneModel }) {
  return (
    <div className="world-labels">
      {m.stalk && <StalkTooltip show={m.tip} strands={m.stalk.strands} locale={m.props.locale} />}
      <NameTags m={m} />
      <CompactionChips m={m} />
      <div ref={m.ariaLog.host} />
      <SquadDom squad={m.squad} scene={m.squadScene} />
      <ZoneLabels m={m} />
    </div>
  );
}

export function SpeechBubbles({ m }: { m: SceneModel }) {
  const { props, layout } = m;
  return (
    <SpeechLayer
      items={m.speakers.flatMap((a) => {
        const speech = props.speech?.[a.id];
        return speech
          ? [{ id: a.id, speech, accent: departmentAt(floorOfDesk(layout, a.id)).accent }]
          : [];
      })}
      elements={m.speechElements.current}
      animate={!props.reducedMotion}
      tags={m.zh ? { user: '提示', assistant: '回覆' } : { user: 'Prompt', assistant: 'Reply' }}
    />
  );
}

export function SceneCaptions({ m }: { m: SceneModel }) {
  const { props, nav, zh } = m;
  return (
    <>
      {nav.directed?.entry === 'cut' && (
        <div className="cut-dip" key={nav.directed.startedAt} aria-hidden="true" />
      )}
      {nav.directed && (
        <ShotCaption
          zh={zh}
          shot={nav.directed.shot}
          agents={props.agents}
          doing={props.doing}
          attention={props.attention}
        />
      )}
    </>
  );
}

export function HudPanels({ m }: { m: SceneModel }) {
  const { props, nav, zh, floor, exploded } = m;
  const badge = props.floorKpi?.[floor];
  if (m.compact)
    return (
      <CompactHud
        zh={zh}
        floor={floor}
        exploded={exploded}
        follow={m.auto}
        labels={m.namesOn}
        perFloor={nav.perFloor}
        onFloor={(next) => nav.showFloor(next)}
        onExplode={nav.toggleExploded}
        onFollow={nav.toggleFollow}
        onLabels={() => m.setNamesOn((v) => !v)}
      />
    );
  return (
    <>
      <FloorHud zh={zh} exploded={exploded} floor={floor} perFloor={nav.perFloor} />
      {!exploded && badge && props.onOpenFloorKpi && (
        <FloorPlaque floor={floor} badge={badge} onOpen={props.onOpenFloorKpi} />
      )}
      <BuildingPanel
        zh={zh}
        floor={floor}
        exploded={exploded}
        follow={m.auto}
        perFloor={nav.perFloor}
        kpi={props.floorKpi}
        onFloor={nav.showFloor}
        onExplode={nav.toggleExploded}
        onFollow={nav.toggleFollow}
      />
    </>
  );
}
