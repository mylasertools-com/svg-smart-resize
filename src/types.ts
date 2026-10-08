export type Point = readonly [number, number];
export type Matrix = readonly [number, number, number, number, number, number];
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type FeatureKind = 'hole' | 'slot';
export type PreserveMode = 'all' | 'width' | 'none';
export interface Feature {
  /** Stable for the same source SVG; use this ID in preserve.features. */
  id: string;
  elementId?: string;
  subpath: number;
  kind: FeatureKind;
  /** An enclosed cutout, or a rectangular notch in an outline. */
  shape: 'interior' | 'notch';
  /** Physical bounding box in millimetres, including ancestor transforms. */
  bounds: Bounds;
  center: Point;
  /** Length and width of an orthogonal slot, in millimetres. */
  length?: number;
  width?: number;
  /** Unit vector along the slot's long axis. */
  axis?: Point;
  source: 'detected' | 'marked';
}
export interface Issue {
  code: 'FEATURE_OUTSIDE_OUTLINE' | 'FEATURE_OVERLAP';
  featureId: string;
  message: string;
}
export interface AnalyzeOptions {
  /** Curve flattening tolerance in mm. Default 0.02. */
  tolerance?: number;
}
export interface Analysis {
  width: number;
  height: number;
  unit: 'mm';
  features: Feature[];
}
export interface ResizeOptions extends AnalyzeOptions {
  /** Output viewport in mm (default), cm, in, or px. Omit one to keep aspect ratio. */
  width?: number;
  height?: number;
  unit?: 'mm' | 'cm' | 'in' | 'px';
  /** Alternative to width/height. Positive scalar, or independent [x, y] factors. */
  scale?: number | readonly [number, number];
  preserve?: {
    /** Preserve detected holes' full physical size. Default false. */
    holes?: boolean;
    /** true = all dimensions; 'width' = narrow dimension only. Default false. */
    slots?: boolean | 'width';
    /** Feature IDs from analyzeSvg; overrides holes/slots and source annotations. */
    features?: Readonly<Record<string, PreserveMode>>;
  };
  /** Throw when preserved features intersect or escape their containing outline. */
  strict?: boolean;
  /** Decimal places for rewritten geometry. Default 6, range 2–12. */
  precision?: number;
}
export interface ResizeResult extends Analysis {
  svg: string;
  scale: Point;
  preserved: Array<{ id: string; mode: Exclude<PreserveMode, 'none'> }>;
  issues: Issue[];
}
export class SvgResizeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SvgResizeError';
  }
}
