import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { sendEmail } from '@/lib/messaging/email/mailer'

export const dynamic = 'force-dynamic'

const logger = createLogger('SystemMailSendAPI')

const SystemMailSendSchema = z.object({
  to: z.string().min(1, 'To email is required'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Email body is required'),
  contentType: z.enum(['text', 'html']).optional().nullable(),
  cc: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .optional()
    .nullable(),
  bcc: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .optional()
    .nullable(),
  replyTo: z
    .union([z.string().min(1), z.array(z.string().min(1))])
    .optional()
    .nullable(),
})

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkInternalAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized system mail send attempt: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          message: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    logger.info(`[${requestId}] Authenticated system mail request via ${authResult.authType}`, {
      userId: authResult.userId,
    })

    const body = await request.json()
    const validatedData = SystemMailSendSchema.parse(body)

    const contentType = validatedData.contentType || 'text'

    logger.info(`[${requestId}] Sending email via system mailer`, {
      to: validatedData.to,
      subject: validatedData.subject,
      bodyLength: validatedData.body.length,
    })

    const result = await sendEmail({
      to: validatedData.to,
      subject: validatedData.subject,
      html: contentType === 'html' ? validatedData.body : undefined,
      text: contentType === 'text' ? validatedData.body : validatedData.body.replace(/<[^>]*>/g, ''),
      emailType: 'transactional',
      includeUnsubscribe: false,
      replyTo: typeof validatedData.replyTo === 'string' ? validatedData.replyTo : undefined,
    })

    if (!result.success) {
      logger.error(`[${requestId}] System email sending failed: ${result.message}`)
      return NextResponse.json(
        {
          success: false,
          message: result.message,
        },
        { status: 500 }
      )
    }

    logger.info(`[${requestId}] System email sent successfully`, {
      id: result.data?.id,
      to: validatedData.to,
    })

    return NextResponse.json({
      success: true,
      message: result.message,
      data: result.data,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid request data`, { errors: error.errors })
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request data',
          errors: error.errors,
        },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error sending system email:`, error)

    return NextResponse.json(
      {
        success: false,
        message: 'Internal server error while sending email',
        data: {},
      },
      { status: 500 }
    )
  }
}
