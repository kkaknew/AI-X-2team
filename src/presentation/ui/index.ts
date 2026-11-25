/**
 * 표현 계층 공통 부품 (Figma 시안 "공통 컴포넌트 · 문구표")
 * 화면들은 색·실패·안내·로딩·오류를 여기서 가져다 쓴다.
 */
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';
export { DailyNotice, type DailyNoticeProps } from './DailyNotice';
export { ErrorMessage, type ErrorMessageProps } from './ErrorMessage';
export { FailureCard, type FailureCardProps } from './FailureCard';
export { Fruit, TreeIllustration } from './Illustration';
export { fitHeight, fruitArtFor, TREE_ART_SIZE, treeArtFor, type FruitArt, type TreeArt } from './illustrations';
export { Loading, type LoadingProps } from './Loading';
export { splitNotice } from './notice';
export { SvgIcon } from './SvgIcon';
export {
  activitySvg,
  chevronLeftSvg,
  chevronRightSvg,
  dropSvg,
  noticeDropSvg,
  treeMainSvg,
  userSvg,
} from './svgs';
export { colors, fontSize, radius, sleepColors, weight } from './theme';
