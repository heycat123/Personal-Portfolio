export function getCaseRouteId(item) {
  if (!item) {
    return null;
  }
  if (typeof item === 'string') {
    return item || null;
  }
  return item.caseUrlId || item.case_url_id || item.routeCaseId || item.route_case_id || item.caseId || item.case_id || null;
}

export function getCaseBackendId(item) {
  if (!item) {
    return null;
  }
  if (typeof item === 'string') {
    return item || null;
  }
  return item.caseId || item.case_id || null;
}

export function caseMatchesRouteId(item, routeId) {
  const normalizedRouteId = String(routeId || '');
  if (!normalizedRouteId) {
    return false;
  }
  return [getCaseRouteId(item), getCaseBackendId(item)]
    .filter(Boolean)
    .some((candidate) => String(candidate) === normalizedRouteId);
}

export function evidenceCasePath(caseOrRouteId, suffix = '') {
  const routeId = getCaseRouteId(caseOrRouteId);
  if (!routeId) {
    return '/evidence/cases';
  }
  return `/evidence/cases/${encodeURIComponent(routeId)}${suffix}`;
}

export function evidenceCaseRelativePath(caseOrRouteId, suffix = '') {
  return evidenceCasePath(caseOrRouteId, suffix).replace('/evidence/', '');
}
