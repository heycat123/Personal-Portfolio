export function getCaseRouteId(item) {
  if (!item) {
    return null;
  }
  if (typeof item === 'string') {
    return item || null;
  }
  const explicitRouteId = item.caseUrlId || item.case_url_id || item.routeCaseId || item.route_case_id;
  if (explicitRouteId) {
    return explicitRouteId;
  }
  const backendId = item.caseId || item.case_id;
  return String(backendId || '').startsWith('case_') ? backendId : null;
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
  return String(getCaseRouteId(item) || '') === normalizedRouteId;
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
