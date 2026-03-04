import type { ToolConfig } from '@/tools/types'

interface SystemSendEmailParams {
  to: string
  subject: string
  body: string
  contentType?: string
  cc?: string
  bcc?: string
  replyTo?: string
}

interface SystemSendEmailResult {
  success: boolean
  output: {
    success: boolean
    id: string
    to: string
    subject: string
    body: string
  }
}

export const systemSendEmailTool: ToolConfig<SystemSendEmailParams, SystemSendEmailResult> = {
  id: 'system_send_email',
  name: 'Send Email',
  description: 'Send an email using the system mailer (no API key needed)',
  version: '1.0.0',

  params: {
    to: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Recipient email address',
    },
    subject: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Email subject line',
    },
    body: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Email body content (plain text or HTML based on contentType)',
    },
    contentType: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Content type: "text" for plain text or "html" for HTML content',
    },
    cc: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Carbon copy recipient email address',
    },
    bcc: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Blind carbon copy recipient email address',
    },
    replyTo: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Reply-to email address',
    },
  },

  request: {
    url: '/api/tools/mail/system-send',
    method: 'POST',
    headers: () => ({
      'Content-Type': 'application/json',
    }),
    body: (params: SystemSendEmailParams) => ({
      to: params.to,
      subject: params.subject,
      body: params.body,
      contentType: params.contentType || 'text',
      ...(params.cc && { cc: params.cc }),
      ...(params.bcc && { bcc: params.bcc }),
      ...(params.replyTo && { replyTo: params.replyTo }),
    }),
  },

  transformResponse: async (response: Response, params): Promise<SystemSendEmailResult> => {
    const result = await response.json()

    return {
      success: true,
      output: {
        success: result.success,
        id: result.data?.id || '',
        to: params?.to || '',
        subject: params?.subject || '',
        body: params?.body || '',
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the email was sent successfully' },
    id: { type: 'string', description: 'Email ID' },
    to: { type: 'string', description: 'Recipient email address' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body content' },
  },
}
