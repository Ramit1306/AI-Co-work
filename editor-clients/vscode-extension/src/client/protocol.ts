// src/client/protocol.ts
export interface Message {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string };
}

export class Protocol {
  static serialize(msg: Message): string {
    return JSON.stringify(msg);
  }

  static deserialize(data: string): Message {
    return JSON.parse(data);
  }

  static createRequest(method: string, params: any): Message {
    return { id: crypto.randomUUID(), type: 'request', method, params };
  }

  static createResponse(id: string, result: any): Message {
    return { id, type: 'response', result };
  }

  static createError(id: string, code: number, message: string): Message {
    return { id, type: 'response', error: { code, message } };
  }

  static createNotification(method: string, params: any): Message {
    return { id: crypto.randomUUID(), type: 'notification', method, params };
  }
}