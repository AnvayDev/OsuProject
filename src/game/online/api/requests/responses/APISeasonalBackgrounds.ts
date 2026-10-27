// Ported from osu.Game/Online/API/Requests/Responses/APISeasonalBackgrounds.cs

export interface APISeasonalBackgrounds {
  /** ends_at */
  endDate: Date;

  backgrounds: APISeasonalBackground[] | null;
}

export interface APISeasonalBackground {
  url: string;
}
