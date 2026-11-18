import { useEffect, useMemo, useState } from "react";
import { listScreenings, listAgents, toRecord, nameKey, defaultTeam } from "../qaApi";

// Loads every screening plus the agent roster (for team lookups). Shared by
// the Dashboard and Screenings pages.
export function useQaData(refreshKey = 0) {
  const [records, setRecords] = useState([]);
  const [truncated, setTruncated] = useState(false);
  const [teamByName, setTeamByName] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([listScreenings(), listAgents().catch(() => ({ agents: [] }))])
      .then(([data, agentData]) => {
        if (!alive) return;
        setRecords((data.screenings || []).map(toRecord));
        setTruncated(!!data.truncated);
        setTeamByName(Object.fromEntries((agentData.agents || []).map((a) => [nameKey(a.name), a.team])));
        setError(null);
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshKey]);

  // An agent's team: their saved team, else the starting default.
  const teamOf = useMemo(() => (name) => teamByName[nameKey(name)] || defaultTeam(name), [teamByName]);

  return { records, truncated, teamOf, loading, error };
}

export const inTeam = (team, filterTeam) => filterTeam === "all" || team === filterTeam;
