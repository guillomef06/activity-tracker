// Activity models
export type {
  Activity,
  ActivityRequest,
  ActivityResponse,
  ActivityWithUser,
  WeeklyScore,
  UserScore,
  BatchImportEntry,
  PositionConflict,
} from './activity.model';

// User models
export type { User, UserProfile, CreateUserProfileRequest, UpdateUserProfileRequest } from './user.model';

// Server models
export type { Server, CreateServerRequest, UpdateServerRequest, ServerWithStats } from './server.model';

// Auth models
export type {
  AdminSignUpRequest,
  MemberSignUpRequest,
  SignInRequest,
  AuthResponse,
  AuthErrorResponse,
} from './auth.model';

// Invitation models
export type {
  InvitationToken,
  CreateInvitationRequest,
  CreateInvitationResponse,
  ValidateInvitationRequest,
  ValidateInvitationResponse,
  InvitationWithServer,
  InvitationMember,
  InvitationWithStats,
} from './invitation.model';

// Activity Point Rule models
export type {
  ActivityPointRule,
  CreatePointRuleRequest,
  UpdatePointRuleRequest,
  PointCalculationResult,
} from './activity-point-rule.model';

// Server Activity Settings models
export type { ServerActivitySettings, UpsertActivitySettingsRequest } from './server-activity-settings.model';

// Discord Webhook models
export type { DiscordWebhook, CreateDiscordWebhookRequest } from './discord-webhook.model';

// MG Event models
export type {
  MgEvent,
  MgEventStatus,
  MgAssignmentMode,
  MgSelectionType,
  MgSelectedBy,
  ServerMgConfig,
  MgRegistration,
  MgRegistrationWithUser,
  MgSelection,
  MgSelectionWithUser,
  MgSelectionPayload,
  MgLeaderboardEntry,
  UpsertServerMgConfigRequest,
} from './mg-event.model';

// Guide models
export type {
  Guide,
  GuideCategory,
  GuideChampion,
  GuideWithDetails,
  Champion,
  ChampionWithSkills,
  Skill,
  HorseTemperament,
  Adornment,
  Ring,
  Gem,
  GemType,
  HorseTraitSlot,
  SkillSlot,
  GemSlot,
  ChampionPosition,
  GuideChampionSkill,
  GuideChampionGem,
  GuideChampionHorseTrait,
  CreateGuideDto,
  UpdateGuideDto,
  CreateGuideChampionDto,
  ChampionSlotConfig,
} from './guide.model';
