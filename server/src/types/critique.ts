/**
 * Types for the critique -> gap-fill -> additive-regenerate refinement loop
 * layered on top of an existing generation. Gap-fill content is always
 * verbatim text pulled from a real, user-uploaded master resume — never a
 * JD keyword, never AI invention — so it stays fully inside the app's
 * existing truthfulness guarantee.
 */

export interface CritiqueImprovementArea {
  id: string;
  title: string;
  detail: string;
  keywords: string[];
}

export interface CritiqueResult {
  /** Claude's own 0-100 assessment, distinct from the deterministic AtsScore. */
  atsScore: number;
  summary: string;
  strengths: string[];
  improvementAreas: CritiqueImprovementArea[];
  createdAt: string;
}

export interface GapSuggestion {
  id: string;
  /** Which CritiqueImprovementArea this addresses. */
  areaId: string;
  kind: 'bullet' | 'skill' | 'project' | 'experience' | 'certification' | 'workshop' | 'hackathon' | 'extracurricular';
  /** id of the item/bullet in the source master resume this came from. */
  sourceId: string;
  /** Set only for a 'bullet' suggestion: the id of the ALREADY-TAILORED
   *  experience/project entry it should be appended to. */
  sourceParentId?: string;
  /** The real, verbatim content — exactly what would be added, unchanged. */
  text: string;
  relevance: number;
  /** True when this exact content is already present in the tailored resume. */
  alreadyIncluded: boolean;
}
