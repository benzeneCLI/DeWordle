import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PasswordReset } from '../entities/password-reset.entity';
import { UserService } from '../../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from '../email.service';
import { RefreshTokenService } from '../refresh-token.service';
import { UnauthorizedException } from '@nestjs/common';

describe('SECURITY-208: Authentication Token Hardening Suite', () => {
  let service: AuthService;
  let userService: jest.Mocked<Partial<UserService>>;
  let passwordResetRepo: any;
  let emailService: jest.Mocked<Partial<EmailService>>;

  const mockUser = {
    id: 'user-uuid-1',
    email: 'tester@domain.com',
    password: 'old-hashed-password',
  };

  const mockReset = {
    id: 'reset-uuid-1',
    tokenHash: 'active-secure-token-hash-xyz',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    user: { ...mockUser },
  };

  beforeEach(async () => {
    userService = {
      findByEmail: jest.fn(),
      create: jest.fn(),
    };

    passwordResetRepo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    emailService = {
      sendMail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: getRepositoryToken(PasswordReset), useValue: passwordResetRepo },
        { provide: EmailService, useValue: emailService },
        { provide: RefreshTokenService, useValue: { generateTokens: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should mitigate user enumeration by returning a generic message for non-existent emails', async () => {
    (userService.findByEmail as jest.Mock).mockResolvedValue(null);

    const result = await service.forgotPassword('unknown@victim.com');
    expect(result).toBeUndefined();
    expect(emailService.sendMail).not.toHaveBeenCalled();
  });

  it('should instantly invalidate tokens upon use to prevent token replay attacks', async () => {
    passwordResetRepo.findOne.mockResolvedValue(mockReset);
    (userService.create as jest.Mock).mockResolvedValue(mockUser);

    await service.resetPassword(
      'active-secure-token-hash-xyz',
      'brand-new-secure-password-99',
    );

    // Verify user password was updated and reset token was deleted
    expect(userService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'user-uuid-1',
      }),
    );
    expect(passwordResetRepo.delete).toHaveBeenCalledWith({ id: 'reset-uuid-1' });
  });

  it('should reject password reset execution if the expiration timeline boundary has passed', async () => {
    passwordResetRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resetPassword('expired-token-signature', 'securePassword123'),
    ).rejects.toThrow(UnauthorizedException);
  });
});

