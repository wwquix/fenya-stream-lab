function parseCsvRows(contents) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index];

    if (character === '"') {
      if (quoted && contents[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && contents[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim())) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim())) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(value) {
  return value.replace(/^\uFEFF/, "").trim().replaceAll("-", "_").toLowerCase();
}

function mapCsvRecord(record) {
  const type = record.type
    || (record.message || record.text ? "chat_message" : null)
    || (record.viewers ? "viewer_sample" : null);
  const common = {
    eventId: record.event_id || record.eventid || undefined,
    streamId: record.stream_id || record.streamid,
    timestamp: record.timestamp,
    type,
  };

  if (type === "chat_message") {
    return {
      ...common,
      chatter: record.chatter || record.nickname || record.user,
      message: record.message || record.text,
      messageType: record.message_type || "normal",
    };
  }

  if (type === "viewer_sample") {
    return {
      ...common,
      viewers: record.viewers,
      messagesPerMinute: record.messages_per_minute || record.messagesperminute || 0,
    };
  }

  return common;
}

export function parseCsvImport(contents) {
  if (typeof contents !== "string" || !contents.trim()) {
    throw new TypeError("CSV body must be a non-empty string.");
  }

  const rows = parseCsvRows(contents);
  if (rows.length < 2) {
    throw new TypeError("CSV must contain a header and at least one data row.");
  }

  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((values, index) => {
    const record = Object.fromEntries(headers.map((header, columnIndex) => [
      header,
      values[columnIndex]?.trim() ?? "",
    ]));
    return {
      rowNumber: index + 2,
      payload: mapCsvRecord(record),
    };
  });
}
