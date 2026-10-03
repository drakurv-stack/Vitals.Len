export type BodyReportExplanation = {
  explanation: string;
  tip: string;
};

export const BODY_REPORT_EXPLANATIONS: Record<string, BodyReportExplanation> = {
  stress: {
    explanation:
      'Stress is not calculated from the measurements available in this report. VitalLens does not infer a stress level from a camera session.',
    tip: 'If it feels useful, pause for a moment and notice how you feel in your own words.',
  },
  energy: {
    explanation:
      'An energy score was not returned. A camera measurement cannot reliably describe how rested or energized you feel.',
    tip: 'Use your own sense of energy, and consider taking a quiet break if you need one.',
  },
  health: {
    explanation:
      'There is no overall health score here. These estimates are not a health assessment or a diagnosis.',
    tip: 'For health questions, talk with a qualified healthcare professional.',
  },
  focus: {
    explanation:
      'Focus is not measured by this camera session, so no focus score is available.',
    tip: 'If you are checking in with yourself, take a moment away from the screen and return when ready.',
  },
  hrvScore: {
    explanation:
      'A validated HRV score was not provided. Individual pulse-interval measurements are shown separately when available.',
    tip: 'For a more consistent personal record, measure under similar conditions and treat each reading as an estimate.',
  },
  coherence: {
    explanation:
      'Coherence is not calculated from the data available in this report.',
    tip: 'A slow, comfortable breath can be a simple moment of reflection; no score is needed.',
  },
  heartRate: {
    explanation:
      'Heart rate is the number of detected pulse beats per minute during this session. Camera-derived values are estimates.',
    tip: 'For a more useful personal comparison, measure while still and in similar conditions.',
  },
  respiratoryRate: {
    explanation:
      'Respiratory rate is an estimate of breaths per minute during the session, when a reading was returned.',
    tip: 'Breathing naturally and staying still may help the camera capture a clearer signal.',
  },
  hrvSdnn: {
    explanation:
      'SDNN describes the spread of detected pulse-to-pulse intervals in this session. It is not a standalone measure of health.',
    tip: 'Treat this as a session estimate rather than a target to reach.',
  },
  hrvRmssd: {
    explanation:
      'RMSSD describes short-term changes between successive pulse-to-pulse intervals in this session.',
    tip: 'Compare only your own readings gathered in similar conditions; this estimate is not a diagnosis.',
  },
  hrvPnn50: {
    explanation:
      'pNN50 is the percentage of successive detected pulse intervals that differ by more than 50 milliseconds.',
    tip: 'A single session can vary. Use this as a wellness estimate, not a score or a goal.',
  },
  meanPulseInterval: {
    explanation:
      'Mean pulse interval is the average time between detected optical pulses in this fingertip PPG session. It is not an ECG R–R interval.',
    tip: 'Stay still and keep the camera or fingertip contact steady for a clearer reading.',
  },
  hrvModa: {
    explanation:
      'Moda is the center of the most common 50 ms bin of quality-screened optical pulse intervals.',
    tip: 'This is a descriptive PPG estimate, not a health score or target.',
  },
  hrvAmo50: {
    explanation:
      'AMo50 is the share of quality-screened optical pulse intervals in the most common 50 ms bin.',
    tip: 'Compare only readings collected with similar signal quality and conditions.',
  },
  hrvMxDmn: {
    explanation:
      'MxDMn is the range between the shortest and longest quality-screened optical pulse intervals.',
    tip: 'A single session can vary; this estimate does not diagnose a condition.',
  },
  hrvCv: {
    explanation:
      'CV expresses pulse-interval standard deviation as a percentage of the mean interval.',
    tip: 'Treat it as a session-specific optical estimate, not a goal.',
  },
  hrvStressIndex: {
    explanation:
      'This experimental index is derived from the histogram of quality-screened optical pulse intervals. It is not an emotional stress score or diagnosis.',
    tip: 'Do not use this experimental estimate to assess or manage stress.',
  },
};

export const BODY_REPORT_SCORE_KEYS = [
  'stress',
  'energy',
  'health',
  'focus',
  'hrvScore',
  'coherence',
] as const;

export const BODY_REPORT_METRIC_DETAILS: Record<
  string,
  { label: string; unit: string }
> = {
  heartRate: { label: 'Heart rate', unit: 'bpm' },
  respiratoryRate: { label: 'Respiratory rate', unit: 'breaths/min' },
  hrvSdnn: { label: 'HRV · SDNN', unit: 'ms' },
  hrvRmssd: { label: 'HRV · RMSSD', unit: 'ms' },
  hrvPnn50: { label: 'HRV · pNN50', unit: '%' },
  meanPulseInterval: { label: 'Mean pulse interval', unit: 'ms' },
  hrvModa: { label: 'Moda · PPG', unit: 'ms' },
  hrvAmo50: { label: 'AMo50 · PPG', unit: '%' },
  hrvMxDmn: { label: 'MxDMn · PPG', unit: 'ms' },
  hrvCv: { label: 'CV · PPG', unit: '%' },
  hrvStressIndex: { label: 'Stress Index · experimental', unit: 'index' },
};

export const BODY_REPORT_STATUS_COLORS = {
  low: '#6f8fdd',
  good: '#5eaa82',
  average: '#d5a64c',
  high: '#d06d77',
} as const;

export const BODY_REPORT_SCORE_LABELS: Record<
  (typeof BODY_REPORT_SCORE_KEYS)[number],
  string
> = {
  stress: 'Stress',
  energy: 'Energy',
  health: 'Health',
  focus: 'Focus',
  hrvScore: 'HRV Score',
  coherence: 'Coherence',
};