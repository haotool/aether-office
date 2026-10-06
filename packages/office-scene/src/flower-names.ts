import type { Archetype } from './flower-genome.js';

const GENUS: Record<Archetype, [string, string]> = {
  lotus: ['Lotus', '蓮'],
  orchid: ['Orchid', '蘭'],
  lily: ['Lily', '百合'],
  composite: ['Aster', '菊'],
  tulip: ['Tulip', '鬱金香'],
  helix: ['Helix', '螺旋花'],
  techLotus: ['Halo-lotus', '光環蓮'],
  crystal: ['Prism', '晶花'],
};

/** 24 epithets, English and Chinese, each a quality of light or metal. */
const EPITHET: [string, string][] = [
  ['Aurelia', '金輝'],
  ['Nocturna', '夜幕'],
  ['Lumina', '流光'],
  ['Cobalta', '鈷藍'],
  ['Vireon', '翠影'],
  ['Solara', '日冕'],
  ['Argenta', '銀漢'],
  ['Cyanis', '青霧'],
  ['Magenta', '洋紅'],
  ['Zephyra', '風息'],
  ['Ignis', '焰心'],
  ['Glacia', '冰晶'],
  ['Opalia', '蛋白'],
  ['Nebula', '星雲'],
  ['Aurora', '極光'],
  ['Corona', '光冠'],
  ['Violeta', '紫電'],
  ['Citrina', '琥珀'],
  ['Mirabilis', '幻彩'],
  ['Stellaris', '星芒'],
  ['Prisma', '稜光'],
  ['Halcyon', '靜海'],
  ['Neonis', '霓虹'],
  ['Ember', '餘燼'],
];

/** "Lotus Aurelia" in English, "金輝蓮" in Chinese. */
export function speciesName(archetype: Archetype, epithet: number, en: boolean): string {
  const [genusEn, genusZh] = GENUS[archetype];
  const [epithetEn, epithetZh] = EPITHET[epithet % EPITHET.length]!;
  return en ? `${genusEn} ${epithetEn}` : `${epithetZh}${genusZh}`;
}
