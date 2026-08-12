// UI-i18n: русские подписи статусов во всём UI.
// Код → подпись по семействам; fallback = код. Структура { ru: {...} } — прицел
// на en/kz позже (эволюция). Цвета остаются привязаны к КОДУ (STATUS_BADGE).

export type StatusFamily =
  | "CARD"
  | "ORDER"
  | "CODE"
  | "DOC"
  | "QUEUE"
  | "DEVICE";

const RU: Record<string, Record<string, string>> = {
  CARD: {
    DRAFT: "Черновик",
    VALIDATING: "Валидация",
    SUBMITTED: "Отправлена на модерацию",
    IN_REVIEW: "На модерации",
    APPROVED: "Одобрена",
    NEEDS_CORRECTION: "Требует исправления",
    REJECTED: "Отклонена",
    REGISTERING: "Регистрация в НКТ",
    REGISTERED: "Зарегистрирована",
    SUSPENDED: "Приостановлена",
    ARCHIVED: "В архиве",
  },
  ORDER: {
    DRAFT: "Черновик",
    VALIDATING: "Проверка",
    FUNDS_RESERVED: "Резерв средств",
    QUEUED: "В очереди на эмиссию",
    SENT: "Отправлен в ИС МПТ",
    ACCEPTED: "Принят ИС МПТ",
    PROCESSING: "В обработке",
    PARTIALLY_COMPLETED: "Выполнен частично",
    COMPLETED: "Коды получены",
    REJECTED: "Отклонён",
    CANCELLED: "Отменён",
    FAILED: "Ошибка обработки",
    CLOSED: "Закрыт",
  },
  CODE: {
    ACTIVE: "Свободен",
    PRINTED: "Напечатан",
    APPLIED: "Нанесён",
    UTILISED: "Использован",
    INTRODUCED: "В обороте",
    EXPIRED: "Аннулирован",
    AGGREGATED: "В составе агрегата",
    WITHDRAWN: "Выведен из оборота",
    WRITTEN_OFF: "Списан",
  },
  DOC: {
    EXPECTED: "Ожидает ДТ",
    SUBMITTED: "Отправлен",
    IN_PROCESS: "В обработке",
    PARTIALLY_PROCESSED: "Частично обработан",
    SUCCESS: "Завершён",
    ERROR: "Ошибка",
  },
  QUEUE: {
    pending: "В очереди",
    printing: "Печатается",
    done: "Завершено",
  },
  DEVICE: {
    ready: "Готов",
    printing: "Печатает",
    offline: "Нет связи",
  },
};

// фиксированный порядок семейств (пересечение кодов: CARD/ORDER оба имеют DRAFT)
const FAMILY_ORDER: StatusFamily[] = [
  "CARD",
  "ORDER",
  "CODE",
  "DOC",
  "QUEUE",
  "DEVICE",
];

const FLAT = new Map<string, string>();
for (const f of FAMILY_ORDER) {
  for (const [code, label] of Object.entries(RU[f])) {
    if (!FLAT.has(code)) FLAT.set(code, label);
  }
}

export const statusLabel = (code: string): string =>
  FLAT.get(code) ?? code;

// Цвет badge привязан к коду (не к тексту): единая карта для всех семейств.
export const STATUS_BADGE: Record<string, string> = {
  // CARD
  DRAFT: "b-gray",
  VALIDATING: "b-yellow",
  SUBMITTED: "b-blue",
  IN_REVIEW: "b-blue",
  NEEDS_CORRECTION: "b-red",
  APPROVED: "b-green",
  REGISTERING: "b-yellow",
  REGISTERED: "b-green",
  REJECTED: "b-red",
  SUSPENDED: "b-yellow",
  ARCHIVED: "b-gray",
  // ORDER
  FUNDS_RESERVED: "b-yellow",
  QUEUED: "b-blue",
  SENT: "b-blue",
  ACCEPTED: "b-blue",
  PROCESSING: "b-blue",
  PARTIALLY_COMPLETED: "b-yellow",
  COMPLETED: "b-green",
  CANCELLED: "b-gray",
  FAILED: "b-red",
  CLOSED: "b-gray",
  // CODE
  ACTIVE: "b-green",
  PRINTED: "b-blue",
  APPLIED: "b-gray",
  UTILISED: "b-gray",
  INTRODUCED: "b-blue",
  EXPIRED: "b-yellow",
  AGGREGATED: "b-blue",
  WITHDRAWN: "b-red",
  WRITTEN_OFF: "b-red",
  // DOC
  EXPECTED: "b-yellow",
  IN_PROCESS: "b-blue",
  PARTIALLY_PROCESSED: "b-yellow",
  SUCCESS: "b-green",
  ERROR: "b-red",
  // QUEUE/DEVICE (строчные)
  pending: "b-blue",
  printing: "b-blue",
  done: "b-green",
  ready: "b-green",
  offline: "b-gray",
};
