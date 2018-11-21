import { Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import { Donation } from '../models';
import { NgoService } from 'src/app/services/ngo.service';
import { SessionService, ApiService, UtilsService } from 'src/app/services/shared';

import { Contribution } from '../ui/components/donorchart/contribution';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {

  ngoMap = UtilsService.jsonToMap(SessionService.getValue('ngos'));

  constructor(private apiService: ApiService,
    private ngoService: NgoService,
    private sessionService: SessionService) { }

  getUserDonations() {
    const path = `donors/${SessionService.getUser().name}/donations`;
    return this.apiService.get(path).pipe(map(data => this.userDonationsJsonAdopter(data)));
  }

  getDonationsByNGO(ngo_id) {
    const path = `ngos/${ngo_id}/donations`;
    return this.apiService.get(path).pipe(map(data => data));
  }

  getContributorsBySpend(spendId) {
    const path = `spend/${spendId}/spendallocations`;
    return this.apiService.get(path).pipe(map(data => data));
  }

  getNGONameById(nog_id: string) {
    const data = this.ngoService.getNGO(nog_id);
    if (data[0] !== undefined) {
      return data[0].ngo_name;
    }
    return null;
  }

  userContributionJsonAdopter(userContributionData: any = []) {
    const userContributions: Array<Contribution> = [];

    if (userContributionData.length === undefined) {
      userContributionData = [userContributionData];
    }
    for (const key in userContributionData) {
      if (userContributionData[key] !== undefined) {
        const userContribution = <Contribution>userContributionData[key];
        userContributions.push(userContribution);
      }
    }
    return userContributions;
  }

  userDonationsJsonAdopter(userDonationsData: any = []) {
    const userDonations: Array<Donation> = [];

    console.log(userDonationsData);
    if (userDonationsData.length === undefined) {
      userDonationsData = [userDonationsData];
    }
    for (const key in userDonationsData) {
      if (userDonationsData[key] !== undefined) {
        const data = userDonationsData[key];
        const userDonation: Donation = new Donation();

        userDonation.id = data.donationId;
        userDonation.Donor_id = data.donorUserName;
        userDonation.ngo_id = data.ngoRegistrationNumber;
        userDonation.date = new Date(data.donationDate);
        userDonation.amount = data.donationAmount;
        if (this.ngoMap.get(userDonation.ngo_id)) {
          userDonation.ngo_name = this.ngoMap.get(userDonation.ngo_id).ngo_name;
          userDonation.project_id = this.ngoMap.get(userDonation.ngo_id).ngo_about;
        }
        userDonations.push(userDonation);
      }
    }
    return userDonations;
  }
}
