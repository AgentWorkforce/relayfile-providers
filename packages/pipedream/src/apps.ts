import type {
  JsonObject,
  PipedreamApp,
  PipedreamComponent,
  PipedreamEmitter,
  PipedreamListResult,
  PipedreamPageInfo,
  PipedreamTriggerEvent,
  PipedreamTriggerWebhook,
} from "./types.js";

export function normalizeListResult<TItem>(
  raw: unknown,
  mapItem: (value: unknown) => TItem
): PipedreamListResult<TItem> {
  const record = asObject(raw);
  const data = Array.isArray(record.data) ? record.data.map(mapItem) : [];
  return {
    data,
    pageInfo: normalizePageInfo(record.page_info),
    raw,
  };
}

export function normalizeApp(raw: unknown): PipedreamApp {
  const record = asObject(raw);
  return {
    id: asOptionalString(record.id),
    slug: asString(record.name_slug, "app.name_slug"),
    name: asString(record.name, "app.name"),
    authType: asOptionalString(record.auth_type) as PipedreamApp["authType"],
    description: asNullableString(record.description),
    imageUrl: asOptionalString(record.img_src),
    customFieldsJson:
      typeof record.custom_fields_json === "string" || record.custom_fields_json === null
        ? record.custom_fields_json
        : undefined,
    categories: Array.isArray(record.categories)
      ? record.categories.flatMap((value) =>
          typeof value === "string" ? [value] : []
        )
      : [],
    featuredWeight:
      typeof record.featured_weight === "number" ? record.featured_weight : undefined,
    connect: isObject(record.connect) ? record.connect : undefined,
    raw: record,
  };
}

export function normalizeComponent(raw: unknown): PipedreamComponent {
  const record = asObject(raw);
  return {
    id: asString(record.id ?? record.key, "component.id"),
    key: asOptionalString(record.key),
    name: asString(record.name, "component.name"),
    version: asOptionalString(record.version),
    componentType: asOptionalString(record.component_type) as
      | "action"
      | "trigger"
      | undefined,
    description: asNullableString(record.description),
    configurableProps: Array.isArray(record.configurable_props)
      ? record.configurable_props
      : undefined,
    annotations: isObject(record.annotations) ? record.annotations : null,
    raw: record,
  };
}

export function normalizeEmitter(raw: unknown): PipedreamEmitter {
  const record = asObject(raw);
  return {
    id: asString(record.id, "emitter.id"),
    type: asString(record.type, "emitter.type"),
    key: asOptionalString(record.key),
    name: asOptionalString(record.name),
    active: typeof record.active === "boolean" ? record.active : undefined,
    createdAt:
      typeof record.created_at === "number" || typeof record.created_at === "string"
        ? record.created_at
        : undefined,
    updatedAt:
      typeof record.updated_at === "number" || typeof record.updated_at === "string"
        ? record.updated_at
        : undefined,
    endpointUrl: asOptionalString(record.endpoint_url),
    raw: record,
  };
}

export function normalizeTriggerEvent(raw: unknown): PipedreamTriggerEvent {
  const record = asObject(raw);
  return {
    id: asString(record.id, "event.id"),
    type: asString(record.k, "event.k"),
    timestamp: asNumber(record.ts, "event.ts"),
    payload: isObject(record.e) ? record.e : {},
    raw: record,
  };
}

export function normalizeTriggerWebhook(raw: unknown): PipedreamTriggerWebhook {
  const record = asObject(raw);
  return {
    id: asString(record.id, "webhook.id"),
    url: asString(record.url, "webhook.url"),
    signingKey: asOptionalString(record.signing_key),
    signingKeySet: Boolean(record.signing_key_set),
    raw: record,
  };
}

export function normalizePageInfo(raw: unknown): PipedreamPageInfo {
  const record = isObject(raw) ? raw : {};
  return {
    count: typeof record.count === "number" ? record.count : undefined,
    totalCount:
      typeof record.total_count === "number" ? record.total_count : undefined,
    startCursor:
      typeof record.start_cursor === "string" || record.start_cursor === null
        ? record.start_cursor
        : undefined,
    endCursor:
      typeof record.end_cursor === "string" || record.end_cursor === null
        ? record.end_cursor
        : undefined,
  };
}

export function asObject(value: unknown): JsonObject {
  if (isObject(value)) {
    return value;
  }
  throw new Error("Expected an object.");
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, field: string): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new Error(`Expected ${field} to be a non-empty string.`);
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function asNullableString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function asNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  throw new Error(`Expected ${field} to be a number.`);
}
