import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagingService } from './messaging.service';

@ApiTags('messaging')
@Controller('messaging')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Liste des conversations' })
  async getConversations(@CurrentUser('id') userId: string) {
    return this.messagingService.getConversations(userId);
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Créer ou récupérer une conversation' })
  @HttpCode(HttpStatus.OK)
  async getOrCreateConversation(
    @CurrentUser('id') userId: string,
    @Body() body: { otherUserId: string },
  ) {
    return this.messagingService.getOrCreateConversation(
      userId,
      body.otherUserId,
    );
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: "Messages d'une conversation" })
  async getMessages(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagingService.getMessages(
      conversationId,
      userId,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 50,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Envoyer un message' })
  async sendMessage(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { content: string },
  ) {
    return this.messagingService.sendMessage(
      conversationId,
      userId,
      body.content,
    );
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'Marquer les messages comme lus' })
  async markAsRead(
    @Param('id') conversationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messagingService.markAsRead(conversationId, userId);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Nombre total de messages non lus' })
  async getUnreadTotal(@CurrentUser('id') userId: string) {
    return this.messagingService.getUnreadTotal(userId);
  }
}
