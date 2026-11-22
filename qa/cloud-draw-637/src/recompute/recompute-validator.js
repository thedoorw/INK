export function validateRecomputeReport(report) {
  const errors = [];
  if (!report?.status) errors.push({ code: 'RECOMPUTE_STATUS_MISSING' });
  if (report?.overRecomputed?.length) errors.push({ code: 'OVER_RECOMPUTE_DETECTED', objectIds: report.overRecomputed });
  if (report?.underRecomputed?.length) errors.push({ code: 'UNDER_RECOMPUTE_DETECTED', objectIds: report.underRecomputed });
  if (report?.unchangedRequiredObjectIds?.length) errors.push({ code: 'REQUIRED_CHANGE_MISSING', objectIds: report.unchangedRequiredObjectIds });
  if (report?.unaffectedChangedObjectIds?.length) errors.push({ code: 'UNAFFECTED_OBJECT_CHANGED', objectIds: report.unaffectedChangedObjectIds });
  if (report?.missingDependencies?.length) errors.push({ code: 'DEPENDENCY_MISSING', dependencies: report.missingDependencies });
  if (report?.cycles?.length) errors.push({ code: 'DEPENDENCY_CYCLE', cycles: report.cycles });
  return {
    passed: errors.length === 0 && ['LOCAL_RECOMPUTE_COMPLETED', 'FULL_REGENERATION_REQUIRED'].includes(report?.status),
    errors
  };
}
