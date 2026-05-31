import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { FileManagerService, FileFolder } from './filemanager.service';

@Controller('files')
export class FileManagerController {
  constructor(private readonly fileManagerService: FileManagerService) {}

  @Post('upload-url')
  getUploadUrl(
    @Body() body: { submissionId: string; folder: FileFolder; filename: string; contentType: string },
  ) {
    return this.fileManagerService.getUploadUrl(body.submissionId, body.folder, body.filename, body.contentType);
  }

  @Post('confirm')
  confirmUpload(
    @Body()
    body: {
      key: string;
      filename: string;
      contentType: string;
      folder: FileFolder;
      submissionId: string;
      reviewId?: string;
      uploadedById: string;
      size?: number;
    },
  ) {
    return this.fileManagerService.confirmUpload(body);
  }

  @Get('submission/:submissionId')
  listSubmissionFiles(@Param('submissionId') submissionId: string) {
    return this.fileManagerService.listSubmissionFiles(submissionId);
  }

  @Get('review/:reviewId')
  listReviewFiles(@Param('reviewId') reviewId: string) {
    return this.fileManagerService.listReviewFiles(reviewId);
  }

  @Get(':fileId/download-url')
  getDownloadUrl(@Param('fileId') fileId: string) {
    return this.fileManagerService.getDownloadUrl(fileId);
  }

  @Delete(':fileId')
  deleteFile(@Param('fileId') fileId: string, @Body() body: { userId: string }) {
    return this.fileManagerService.deleteFile(fileId, body.userId);
  }
}
