// Tipos de la API interna de tracker.gg. No es una API publica: reflejan la
// estructura observada en el proyecto valorant-coach.

export interface TrackerStat {
  value: number | null;
  displayValue?: string;
  metadata?: Record<string, unknown>;
}

export interface TrackerSegment {
  type: string;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  stats?: Record<string, TrackerStat>;
}

export interface TrackerProfileResponse {
  data?: {
    platformInfo?: {
      platformUserId?: string;
      platformUserHandle?: string;
    };
    metadata?: {
      activeShard?: string;
      privacy?: string;
      accountLevel?: number;
    };
    segments?: TrackerSegment[];
  };
}

export interface TrackerMatch {
  attributes?: {
    id?: string;
    mapId?: string;
    modeId?: string;
  };
  metadata?: {
    modeName?: string;
    result?: string;
    timestamp?: string;
    mapName?: string;
  };
  segments?: TrackerSegment[];
}

export interface TrackerMatchesResponse {
  data?: {
    matches?: TrackerMatch[];
    metadata?: {
      next?: string;
    };
  };
}
