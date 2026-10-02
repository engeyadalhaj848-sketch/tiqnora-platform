import { createLessonRepository, getDefaultStore } from './repos/index.js';

export function classifyFailure(evaluation = {}) {
  const reason = String(evaluation.failure_reason || (Array.isArray(evaluation.failures) ? evaluation.failures[0] : '') || '');
  if (evaluation.passed) return 'none';
  if (/artifact|hash/.test(reason)) return 'artifact_evidence';
  if (/tool_evidence|provider/.test(reason)) return 'tool_evidence';
  if (/injection|policy/.test(reason)) return 'policy';
  if (/schema/.test(reason)) return 'schema';
  return 'quality';
}

/** savedEvaluation must already be persisted — does not save eval again */
export async function recordLearningFromEval(savedEvaluation, { agent_key = null, store = getDefaultStore() } = {}) {
  const lessonRepo = createLessonRepository(store);
  if (savedEvaluation.passed === true) return { evaluation: savedEvaluation, lesson: null };
  const failure_reason = savedEvaluation.failure_reason || (Array.isArray(savedEvaluation.failures) ? savedEvaluation.failures.join('; ') : 'unknown');
  const lesson = await lessonRepo.propose({
    organization_id: savedEvaluation.organization_id || null,
    agent_id: savedEvaluation.agent_id || null,
    source_eval_id: savedEvaluation.id,
    agent_key,
    category: classifyFailure({ ...savedEvaluation, failure_reason }),
    lesson_key: ('les_' + (savedEvaluation.id || Date.now())).slice(0, 40),
    lesson: 'Avoid failure mode: ' + failure_reason + '. Require evidence before claiming success.',
    evidence: { evaluation_id: savedEvaluation.id, score: savedEvaluation.score, failure_reason }
  });
  return { evaluation: savedEvaluation, lesson };
}

export async function approveLesson(lesson_key, { approved_by = null, store = getDefaultStore() } = {}) {
  return createLessonRepository(store).review(lesson_key, { status: 'approved', approved_by });
}
export async function rejectLesson(lesson_key, { approved_by = null, store = getDefaultStore() } = {}) {
  return createLessonRepository(store).review(lesson_key, { status: 'rejected', approved_by });
}
export async function retrieveApprovedLessons({ agent_key = null, store = getDefaultStore(), limit = 5 } = {}) {
  return createLessonRepository(store).listApproved({ agent_key, limit });
}
