import { MailIcon } from '@/components/icons'
import type { BlockConfig } from '@/blocks/types'

export const SendEmailBlock: BlockConfig = {
  type: 'send_email',
  name: 'Send Email',
  description: 'Send an email using the system mailer.',
  longDescription:
    'Send emails directly from your workflow without needing an API key. Uses the system email service to deliver messages.',
  category: 'tools',
  bgColor: '#6366F1',
  icon: MailIcon,

  subBlocks: [
    {
      id: 'to',
      title: 'To',
      type: 'short-input',
      placeholder: 'recipient@example.com',
      required: true,
    },
    {
      id: 'subject',
      title: 'Subject',
      type: 'short-input',
      placeholder: 'Email subject',
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Generate a compelling email subject line based on the user's description.

### GUIDELINES
- Keep it concise (50 characters or less is ideal)
- Make it attention-grabbing
- Avoid spam trigger words
- Be clear about the email content

### EXAMPLES
"Welcome email for new users" -> "Welcome to Our Platform!"
"Order confirmation" -> "Your Order #12345 is Confirmed"
"Newsletter about new features" -> "New Features You'll Love"

Return ONLY the subject line - no explanations, no extra text.`,
        placeholder: 'Describe the email topic...',
      },
    },
    {
      id: 'body',
      title: 'Body',
      type: 'long-input',
      placeholder: 'Email body content',
      required: true,
      wandConfig: {
        enabled: true,
        prompt: `Generate email content based on the user's description.

### GUIDELINES
- Use clear, readable formatting
- Keep paragraphs short
- Include appropriate greeting and sign-off

Return ONLY the email body - no explanations, no extra text.`,
        placeholder: 'Describe the email content...',
      },
    },
    {
      id: 'contentType',
      title: 'Content Type',
      type: 'dropdown',
      options: [
        { label: 'Plain Text', id: 'text' },
        { label: 'HTML', id: 'html' },
      ],
      value: () => 'text',
      mode: 'advanced',
    },
    {
      id: 'cc',
      title: 'CC',
      type: 'short-input',
      placeholder: 'cc@example.com',
      mode: 'advanced',
    },
    {
      id: 'bcc',
      title: 'BCC',
      type: 'short-input',
      placeholder: 'bcc@example.com',
      mode: 'advanced',
    },
    {
      id: 'replyTo',
      title: 'Reply To',
      type: 'short-input',
      placeholder: 'reply@example.com',
      mode: 'advanced',
    },
  ],

  tools: {
    access: ['system_send_email'],
    config: {
      tool: () => 'system_send_email',
      params: (params) => {
        const { ...rest } = params
        return rest
      },
    },
  },

  inputs: {
    to: { type: 'string', description: 'Recipient email address' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body content' },
    contentType: { type: 'string', description: 'Content type (text or html)' },
    cc: { type: 'string', description: 'CC email address' },
    bcc: { type: 'string', description: 'BCC email address' },
    replyTo: { type: 'string', description: 'Reply-to email address' },
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the email was sent successfully' },
    id: { type: 'string', description: 'Email ID' },
    to: { type: 'string', description: 'Recipient email address' },
    subject: { type: 'string', description: 'Email subject' },
    body: { type: 'string', description: 'Email body content' },
  },
}
