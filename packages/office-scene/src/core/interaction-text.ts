import type { Agent } from '@aether/contracts';
import type { EmoteId } from '../animals/emotes.js';
import type { SeatReason } from './seat-drag.js';

/** The words the scene itself speaks (hover card, live announcements, drag hints); the page's own menu has its own. */
export type Words = {
  state: Record<Agent['activity'], string>;
  context: string;
  doing: string;
  emote: Record<EmoteId, string>;
  emoteWait: string;
  emoteBlocked: string;
  menuOpened: string;
  menuClosed: string;
  followOn: string;
  followOff: string;
  pinned: string;
  unpinned: string;
  grouped: string;
  groupCleared: string;
  dragStart: string;
  dragCancelled: string;
  dragMoved: string;
  dragBlocked: Record<SeatReason, string>;
};

const zh: Words = {
  state: {
    idle: '閒置',
    starting: '啟動中',
    working: '工作中',
    reviewing: '審查中',
    waiting_permission: '等待授權',
    waiting_peer: '等待同事',
    error: '錯誤',
    offline: '離線',
    unknown: '未知',
  },
  context: '上下文',
  doing: '正在',
  emote: {
    wave: '揮手',
    thumbs_up: '比讚',
    high_five: '擊掌',
    cheer: '歡呼',
    stretch: '伸懶腰',
    pat: '拍拍',
  },
  emoteWait: '稍等一下再互動',
  emoteBlocked: '現在不在座位上',
  menuOpened: '已開啟動作選單',
  menuClosed: '已關閉動作選單',
  followOn: '鏡頭開始跟隨',
  followOff: '鏡頭停止跟隨',
  pinned: '已釘選到畫面牆',
  unpinned: '已從畫面牆取消釘選',
  grouped: '已選取',
  groupCleared: '已清除多選',
  dragStart: '拖曳座位：放開以放下，Esc 取消',
  dragCancelled: '已取消移動座位',
  dragMoved: '座位已移動',
  dragBlocked: {
    bounds: '超出辦公室範圍',
    aisle: '擋住走道',
    occupied: '已有家具或座位',
    invalid: '這裡不能放',
  },
};

const en: Words = {
  state: {
    idle: 'Idle',
    starting: 'Starting',
    working: 'Working',
    reviewing: 'Reviewing',
    waiting_permission: 'Waiting for approval',
    waiting_peer: 'Waiting for a peer',
    error: 'Error',
    offline: 'Offline',
    unknown: 'Unknown',
  },
  context: 'Context',
  doing: 'Doing',
  emote: {
    wave: 'Wave',
    thumbs_up: 'Thumbs up',
    high_five: 'High five',
    cheer: 'Cheer',
    stretch: 'Stretch',
    pat: 'Pat',
  },
  emoteWait: 'Give it a moment before the next one',
  emoteBlocked: 'Not at the desk right now',
  menuOpened: 'Action menu opened',
  menuClosed: 'Action menu closed',
  followOn: 'Camera is following',
  followOff: 'Camera stopped following',
  pinned: 'Pinned to the wall',
  unpinned: 'Unpinned from the wall',
  grouped: 'Selected',
  groupCleared: 'Selection cleared',
  dragStart: 'Moving the seat: release to drop, Esc to cancel',
  dragCancelled: 'Seat move cancelled',
  dragMoved: 'Seat moved',
  dragBlocked: {
    bounds: 'Outside the office',
    aisle: 'Blocks the aisle',
    occupied: 'Something is already there',
    invalid: 'Cannot go here',
  },
};

export const wordsFor = (zhTW: boolean): Words => (zhTW ? zh : en);
