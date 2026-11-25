import { SvgXml } from 'react-native-svg';

/** 시안에서 내보낸 SVG 한 장을 원래 크기(또는 지정한 크기)로 그린다 */
export function SvgIcon({ xml, width, height }: { xml: string; width: number; height: number }) {
  return <SvgXml xml={xml} width={width} height={height} />;
}
