import { EMAIL } from './site';

/** Anclas de la nav, en el orden del diseño. */
export const NAV = [
  { id: 'servicios', label: 'Servicios' },
  { id: 'metodo', label: 'Cómo trabajo' },
  { id: 'sobre-mi', label: 'Sobre mí' },
  { id: 'twofers', label: 'Digital Twofers' },
] as const;

/** Secciones de la home, en orden. Un test exige que coincidan con las `section[id]` reales. */
export const SECTIONS: readonly string[] = ['inicio', 'servicios', 'metodo', 'sobre-mi', 'clientes', 'twofers', 'contacto'];

/** Solo enlaza a anclas que existen: A7 exige que cada `#id` resuelva. */
export const navFor = (present: readonly string[]): (typeof NAV)[number][] =>
  NAV.filter((n) => present.includes(n.id));

/** `#contacto` cuando existe; mientras tanto, el correo. */
export const contactHref = (present: readonly string[]): string =>
  present.includes('contacto') ? '#contacto' : `mailto:${EMAIL}`;
