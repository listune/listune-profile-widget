export type Snowflake = string;

/**
 * User Application Identity Object
 * The user's external identity for a connected application.
 */
export interface UserApplicationIdentity {
  application_id: Snowflake;
  provider_issued_user_id: string;
  profile?: PartialUserApplicationProfile;
  profiles?: PartialUserApplicationProfile[];
}

export interface PartialUserApplicationProfile {
  /** The external username of the user */
  username?: string | null;
  /** Custom metadata (max 25 keys, 1024 characters per key and value) */
  metadata?: Record<string, string> | null;
  /** The user application data */
  data?: UserApplicationProfileData;
  /** Whether the data is trusted (set by application bot) */
  data_trusted?: boolean;
  connection_visible?: boolean;
}

export interface UserApplicationProfileData {
  /** The primary user application data */
  primary?: UserApplicationProfilePrimaryData;
  /** The dynamic user application data */
  dynamic?: UserApplicationProfileDynamicData[];
}

/**
 * Primary user application data structure
 */
export interface UserApplicationProfilePrimaryData {
  /** The current rank the user has in-game (used for Top Track) */
  rank_name?: string;
  /** The highest rank the user ever had in-game (used for Top Artist) */
  highest_rank?: string;
  /** Duration (in hours) that the user has played the game for (used for Listen Time) */
  playtime_hours?: number;
  /** Used for Tracks Played */
  total_wins?: number;
  /** Used for Liked Songs */
  total_games?: number;
  
  // Custom or game-specific primary fields
  /** The name of the server/app */
  server_name?: string;
  /** The ID of the in-game account */
  user_id?: string;
  login_days?: number;
  data_bank_level?: string;
}

export interface UnfurledMediaItem {
  url: string;
  width?: number;
  height?: number;
}

export enum DynamicDataType {
  TEXT = 1,
  NUMBER = 2,
  IMAGE = 3,
}

export interface UserApplicationProfileDynamicData {
  /** 1 = TEXT, 2 = NUMBER, 3 = IMAGE */
  type: DynamicDataType;
  /** The name of the dynamic field */
  name: string;
  /** The value (scalar or object depending on type) */
  value: string | number | DynamicImageValue;
}

export interface DynamicImageValue {
  url: string;
}

/**
 * Structure of a Widget Configuration
 */
export interface WidgetConfig {
  id: Snowflake;
  display_name: string;
  status: "published" | "draft";
  surfaces: Record<string, WidgetSurface>;
}

export type SurfaceType =
  | "widget_top"
  | "widget_bottom"
  | "add_widget_preview"
  | "mini_profile"
  | "activity_accessory";

export interface WidgetSurface {
  /** The layout used for this surface */
  layout: string;
  /** The components of the surface */
  components: Record<string, WidgetSurfaceComponent>;
}

export interface WidgetSurfaceComponent {
  /** The fields of the component */
  fields: Record<string, WidgetSurfaceComponentField>;
}

export interface WidgetSurfaceComponentField {
  /** The type of the value */
  value_type: "data" | "custom_string" | "application_asset" | "application_localized_string";
  /** The presentation type of the value */
  presentation_type: "image" | "number" | "text" | "duration";
  /** The actual value or reference key to the data (e.g. "rank_name", "total_wins") */
  value: string;
  /** The fallback value if the value is unavailable */
  fallback?: WidgetSurfaceComponentField;
}
