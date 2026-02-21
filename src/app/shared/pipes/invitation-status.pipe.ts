import { Pipe, PipeTransform } from '@angular/core';
import type { InvitationWithStats } from '../models';

@Pipe({
  name: 'invitationStatus',
  pure: true,
})
export class InvitationStatusPipe implements PipeTransform {
  transform(invitation: InvitationWithStats): string {
    const isExpired = new Date(invitation.expires_at) < new Date();
    return isExpired ? 'Expired' : 'Active';
  }
}
