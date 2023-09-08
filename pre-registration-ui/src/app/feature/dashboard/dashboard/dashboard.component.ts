import { Component, OnInit, OnDestroy } from "@angular/core";

import { Router } from "@angular/router";
import { MatDialog, MatCheckboxChange } from "@angular/material";

import { TranslateService } from "@ngx-translate/core";
import { DataStorageService } from "src/app/core/services/data-storage.service";
import { RegistrationService } from "src/app/core/services/registration.service";
import { AutoLogoutService } from "src/app/core/services/auto-logout.service";

import { DialougComponent } from "src/app/shared/dialoug/dialoug.component";

import { FileModel } from "src/app/shared/models/demographic-model/file.model";
import { Applicant } from "src/app/shared/models/dashboard-model/dashboard.modal";
import * as appConstants from "../../../app.constants";
import Utils from "src/app/app.util";
import { ConfigService } from "src/app/core/services/config.service";
import { RequestModel } from "src/app/shared/models/request-model/RequestModel";
import { FilesModel } from "src/app/shared/models/demographic-model/files.model";
import { LogService } from "src/app/shared/logger/log.service";
import { Subscription } from "rxjs";
import { NotificationDtoModel } from "src/app/shared/models/notification-model/notification-dto.model";
import { utf8Encode } from "@angular/compiler/src/util";

/**
 * @description This is the dashbaord component which displays all the users linked to the login id
 *              and provide functionality like modifying the information, viewing the acknowledgement
 *              and modifying or booking an appointment.
 *
 * @export
 * @class DashBoardComponent
 * @implements {OnInit}
 * @implements {OnDestroy}
 */
@Component({
  selector: "app-registration",
  templateUrl: "./dashboard.component.html",
  styleUrls: ["./dashboard.component.css"],
})
export class DashBoardComponent implements OnInit, OnDestroy {
  userFile: FileModel[] = [];
  file: FileModel = new FileModel();
  userFiles: FilesModel = new FilesModel(this.userFile);
  loginId = "";
  message = {};
  userPreferredLangCode = localStorage.getItem("userPrefLanguage");
  textDir = localStorage.getItem("dir");
  errorLanguagelabels: any;
  apiErrorCodes: any;
  disableModifyDataButton = false;
  disableModifyAppointmentButton = true;
  fetchedDetails = true;
  modify = false;
  isNewApplication = false;
  isFetched = false;
  allApplicants: any[];
  users: Applicant[] = [];
  selectedUsers = [];
  titleOnError = "";
  subscriptions: Subscription[] = [];
  languagelabels;
  dataCaptureLabels;
  name = "";
  firstName = "";
  lastName = "";
  identityData: any;
  locationHeirarchies: any[];
  mandatoryLanguages: string[];
  optionalLanguages: string[];
  minLanguage: Number;
  maxLanguage: Number;
  isNavigateToDemographic = false;
  appStatusCodes = appConstants.APPLICATION_STATUS_CODES;
  /**
   * @description Creates an instance of DashBoardComponent.
   * @param {Router} router
   * @param {MatDialog} dialog
   * @param {DataStorageService} dataStorageService
   * @param {RegistrationService} regService
   * @param {BookingService} bookingService
   * @param {AutoLogoutService} autoLogout
   * @param {TranslateService} translate
   * @param {ConfigService} configService
   * @memberof DashBoardComponent
   */
  constructor(
    private router: Router,
    public dialog: MatDialog,
    private dataStorageService: DataStorageService,
    private regService: RegistrationService,
    private autoLogout: AutoLogoutService,
    private translate: TranslateService,
    private configService: ConfigService,
    private loggerService: LogService
  ) {
    this.translate.use(this.userPreferredLangCode);
    localStorage.setItem("modifyDocument", "false");
    localStorage.removeItem(appConstants.NEW_APPLICANT_FROM_PREVIEW);
    localStorage.removeItem("muiltyAppointment");
    localStorage.removeItem("modifyMultipleAppointment");
  }

  /**
   * @description Lifecycle hook ngOnInit
   *
   * @memberof DashBoardComponent
   */
  async ngOnInit() {
    this.loginId = localStorage.getItem("loginId");
    this.mandatoryLanguages = Utils.getMandatoryLangs(this.configService);
    this.optionalLanguages = Utils.getOptionalLangs(this.configService);
    this.minLanguage = Utils.getMinLangs(this.configService);
    this.maxLanguage = Utils.getMaxLangs(this.configService);

    this.dataStorageService
      .getI18NLanguageFiles(this.userPreferredLangCode)
      .subscribe((response) => {
        this.languagelabels = response["dashboard"].discard;
        this.dataCaptureLabels = response["dashboard"].dataCaptureLanguage;
        this.errorLanguagelabels = response["error"];
        this.apiErrorCodes = response[appConstants.API_ERROR_CODES];
        if (this.dataCaptureLabels != undefined) {
          this.initUsers();
        }
      });
    const subs = this.autoLogout.currentMessageAutoLogout.subscribe(
      (message) => (this.message = message)
    );
    this.subscriptions.push(subs);
    if (!this.message["timerFired"]) {
      this.autoLogout.getValues(this.userPreferredLangCode);
      this.autoLogout.setValues();
      this.autoLogout.keepWatching();
    } else {
      this.autoLogout.getValues(this.userPreferredLangCode);
      this.autoLogout.continueWatching();
    }
    this.regService.setSameAs("");
    this.name = this.configService.getConfigByKey(
      appConstants.CONFIG_KEYS.preregistration_identity_name
     );
    this.firstName = "firstName";
    this.lastName =  "lastName";

    await this.getIdentityJsonFormat();
  }

  async getIdentityJsonFormat() {
    return new Promise((resolve, reject) => {
      this.dataStorageService.getIdentityJson().subscribe((response) => {
        let jsonSpec = response[appConstants.RESPONSE]["jsonSpec"];
        this.identityData = jsonSpec["identity"]["identity"];
        let locationHeirarchiesFromJson = [
          ...jsonSpec["identity"]["locationHierarchy"],
        ];
        if (Array.isArray(locationHeirarchiesFromJson[0])) {
          this.locationHeirarchies = locationHeirarchiesFromJson;
        } else {
          let hierarchiesArray = [];
          hierarchiesArray.push(locationHeirarchiesFromJson);
          this.locationHeirarchies = hierarchiesArray;
        }
        localStorage.setItem("schema", JSON.stringify(this.identityData));
        localStorage.setItem(
          "locationHierarchy",
          JSON.stringify(this.locationHeirarchies[0])
        );
        resolve(true);
      },
      (error) => {
        this.showErrorMessage(error);
      });
    });  
  }

  /**
   * @description This is the intial set up for the dashboard component
   *
   * @memberof DashBoardComponent
   */
  initUsers() {
    this.getUsers();
  }

  /**
   * @description This is to get all the users assosiated to the login id.
   *
   * @memberof DashBoardComponent
   */
  getUsers() {
    const sub = this.dataStorageService.getUsers(this.loginId).subscribe(
      (applicants: any) => {
        this.loggerService.info("applicants in dashboard", applicants);
        //console.log(applicants);
         if (
                  applicants[appConstants.NESTED_ERROR] &&
                  applicants[appConstants.NESTED_ERROR][0][appConstants.ERROR_CODE] ===
                    appConstants.ERROR_CODES.noApplicantEnrolled
                ) {
                  localStorage.setItem("newApplicant", "true");
                  this.onNewApplication();
                  return;
                }
        if (
          applicants[appConstants.RESPONSE] &&
          applicants[appConstants.RESPONSE] !== null
        ) {
          localStorage.setItem(appConstants.NEW_APPLICANT, "false");

          this.allApplicants =
            applicants[appConstants.RESPONSE][
              appConstants.DASHBOARD_RESPONSE_KEYS.applicant.basicDetails
            ];
          for (
            let index = 0;
            index <
            applicants[appConstants.RESPONSE][
              appConstants.DASHBOARD_RESPONSE_KEYS.applicant.basicDetails
            ].length;
            index++
          ) {
            localStorage.setItem(
              "noOfApplicant",
              applicants[appConstants.RESPONSE][
                appConstants.DASHBOARD_RESPONSE_KEYS.applicant.basicDetails
              ].length
            );
            const applicant = this.createApplicant(applicants, index);
            this.users.push(applicant);
          }
        }
      },
      (error) => {
        //This is a fail safe operation since for first time login
        //user may not have any applications created. No err message to be shown.
        this.loggerService.error("dashboard", error);
        if (Utils.getErrorCode(error) === appConstants.ERROR_CODES.noApplicantEnrolled) {
          localStorage.setItem(appConstants.NEW_APPLICANT, "true");
          this.onNewApplication();
          this.isFetched = true;
          return;
        }
      },
      () => {
        this.isFetched = true;
      }
    );
    this.subscriptions.push(sub);
  }

  /**
   * @description This method return the appointment date and time.
   *
   * @private
   * @param {*} applicant
   * @returns the appointment date and time
   * @memberof DashBoardComponent
   */
  private createAppointmentDateTime(applicant: any) {
    const bookingRegistrationDTO =
      applicant[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ];
    const date =
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.regDate
      ];
    const fromTime =
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO
          .time_slot_from
      ];
    const toTime =
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.time_slot_to
      ];
    let appointmentDateTime = date + " ( " + fromTime + " - " + toTime + " )";
    return appointmentDateTime;
  }

  /**
   * @description This method return the appointment date.
   *
   * @private
   * @param {*} applicant
   * @returns the appointment date
   * @memberof DashBoardComponent
   */
  private createAppointmentDate(applicant: any) {
    const bookingRegistrationDTO =
      applicant[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ];
    const ltrLangs = this.configService
    .getConfigByKey(appConstants.CONFIG_KEYS.mosip_left_to_right_orientation)
    .split(",");  
    const date = Utils.getBookingDateTime(
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.regDate
      ],
      "",
      this.userPreferredLangCode,
      ltrLangs
    );
    let appointmentDate = date;
    return appointmentDate;
  }

  /**
   * @description This method return the appointment time.
   *
   * @private
   * @param {*} applicant
   * @returns the appointment time
   * @memberof DashBoardComponent
   */
  private createAppointmentTime(applicant: any) {
    const bookingRegistrationDTO =
      applicant[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ];
    const fromTime =
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO
          .time_slot_from
      ];
    const toTime =
      bookingRegistrationDTO[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.time_slot_to
      ];
    let appointmentTime = " ( " + fromTime + " - " + toTime + " ) ";
    return appointmentTime;
  }

  /**
   * @description This method parse the applicants and return the individual applicant.
   *
   * @param {*} applicants
   * @param {number} index
   * @returns
   * @memberof DashBoardComponent
   */
  createApplicant(applicants: any, index: number) {
    const applicantResponse =
      applicants[appConstants.RESPONSE][
        appConstants.DASHBOARD_RESPONSE_KEYS.applicant.basicDetails
      ][index];
    let dataAvailableLanguages = [];
    if (Array.isArray(applicantResponse["dataCaptureLanguage"])) {
      dataAvailableLanguages = applicantResponse["dataCaptureLanguage"];
      dataAvailableLanguages.sort(function (a, b) {
        return a - b;
      });
      dataAvailableLanguages = Utils.reorderLangsForUserPreferredLang(dataAvailableLanguages, this.userPreferredLangCode);
    }
    let applicantName = "";

  const firstNameField = applicantResponse["demographicMetadata"][this.firstName];
  const lastNameField = applicantResponse["demographicMetadata"][this.lastName];
    if (Array.isArray(firstNameField) && Array.isArray(lastNameField)) {
      firstNameField.forEach(fld => {
        if (fld.language == this.userPreferredLangCode) {
          applicantName = fld.value + " ";
        }
      });
      lastNameField.forEach(fld => {
        if (fld.language == this.userPreferredLangCode) {
          applicantName = applicantName + fld.value;
        }
      });
      if (applicantName == "" && dataAvailableLanguages.length > 0) {
        firstNameField.forEach(fld => {
          if (fld.language == dataAvailableLanguages[0]) {
            applicantName = fld.value + " ";
          }
        });  
        lastNameField.forEach(fld => {
          if (fld.language == dataAvailableLanguages[0]) {
            applicantName = applicantName + fld.value;
          }
        });  
      }
    } else {
      if (firstNameField && lastNameField )
      applicantName = firstNameField + "  " + lastNameField;
      else 
      applicantName = "";
    }
 
    let dataCaptureLanguagesLabels = Utils.getLanguageLabels(JSON.stringify(dataAvailableLanguages), 
          localStorage.getItem(appConstants.LANGUAGE_CODE_VALUES));
    const applicant: Applicant = {
      applicationID:
        applicantResponse[appConstants.DASHBOARD_RESPONSE_KEYS.applicant.preId],
      name: applicantName,
      appointmentDateTime: applicantResponse[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ]
        ? this.createAppointmentDateTime(applicantResponse)
        : "-",
      appointmentDate: applicantResponse[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ]
        ? this.createAppointmentDate(applicantResponse)
        : "-",
      appointmentTime: applicantResponse[
        appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
      ]
        ? this.createAppointmentTime(applicantResponse)
        : "-",
      status:
        applicantResponse[
          appConstants.DASHBOARD_RESPONSE_KEYS.applicant.statusCode
        ],
      regDto:
        applicantResponse[
          appConstants.DASHBOARD_RESPONSE_KEYS.bookingRegistrationDTO.dto
        ],
      postalCode:
        applicantResponse["demographicMetadata"][
          appConstants.DASHBOARD_RESPONSE_KEYS.applicant.postalCode
        ],
      dataCaptureLangs: dataCaptureLanguagesLabels    
    };

    return applicant;
  }

  /**
   * @description This method navigate the user to demographic page if it is a new applicant.
   *
   * @memberof DashBoardComponent
   */
  async onNewApplication() {
     //first check if data capture languages are in session or not
     const dataCaptureLangsFromSession = localStorage.getItem(appConstants.DATA_CAPTURE_LANGUAGES);
     console.log(`dataCaptureLangsFromSession: ${dataCaptureLangsFromSession}`);
     if (dataCaptureLangsFromSession) {
      localStorage.setItem(appConstants.MODIFY_USER, "false");
      localStorage.setItem(appConstants.NEW_APPLICANT, "true");
      if (this.loginId) {
        this.router.navigateByUrl(
          `${this.userPreferredLangCode}/pre-registration/demographic/new`
        );
        this.isNewApplication = true;
      } else {
        this.router.navigate(["/"]);
      }
     } else {
       //no data capture langs stored in session, hence prompt the user  
      if (
        this.maxLanguage > 1 &&
        this.optionalLanguages.length > 0 &&
        this.maxLanguage !== this.mandatoryLanguages.length
      ) {
        await this.openLangSelectionPopup();
      } else if (this.mandatoryLanguages.length > 0) {
        if (this.maxLanguage == 1) {
          localStorage.setItem(appConstants.DATA_CAPTURE_LANGUAGES, JSON.stringify([this.mandatoryLanguages[0]]));
        } else {
          let reorderedArr = Utils.reorderLangsForUserPreferredLang(this.mandatoryLanguages, this.userPreferredLangCode);
          localStorage.setItem(appConstants.DATA_CAPTURE_LANGUAGES, JSON.stringify(reorderedArr));
        }
        this.isNavigateToDemographic = true;
      }
      if (this.isNavigateToDemographic) {
        let dataCaptureLanguagesLabels = Utils.getLanguageLabels(localStorage.getItem(appConstants.DATA_CAPTURE_LANGUAGES), 
          localStorage.getItem(appConstants.LANGUAGE_CODE_VALUES));
        localStorage.setItem(appConstants.DATA_CAPTURE_LANGUAGE_LABELS, JSON.stringify(dataCaptureLanguagesLabels));
        localStorage.setItem(appConstants.MODIFY_USER, "false");
        localStorage.setItem(appConstants.NEW_APPLICANT, "true");
        if (this.loginId) {
          this.router.navigateByUrl(
            `${this.userPreferredLangCode}/pre-registration/demographic/new`
          );
          this.isNewApplication = true;
        } else {
          this.router.navigate(["/"]);
        }
      }
    }
  }

  openLangSelectionPopup() {
    return new Promise((resolve) => {
      const popupAttributes = Utils.getLangSelectionPopupAttributes(this.textDir, 
        this.dataCaptureLabels, this.mandatoryLanguages, this.minLanguage, this.maxLanguage, this.userPreferredLangCode);
      const dialogRef = this.openDialog(popupAttributes, "550px", "350px");
      dialogRef.afterClosed().subscribe((res) => {
        console.log(res);
        if (res == undefined) {
          this.isNavigateToDemographic = false;
        } else {
          let reorderedArr = Utils.reorderLangsForUserPreferredLang(res, this.userPreferredLangCode);
          localStorage.setItem(appConstants.DATA_CAPTURE_LANGUAGES, JSON.stringify(reorderedArr));
          this.isNavigateToDemographic = true;
        }
        resolve(true);
      });
    });
  }

  openDialog(data, width, height?) {
    const dialogRef = this.dialog.open(DialougComponent, {
      width: width,
      // height: height,
      data: data,
      restoreFocus: false
    });
    return dialogRef;
  }

  radioButtonsStatus(status: string) {
    let data = {};
    if (status.toLowerCase() === "booked") {
      data = {
        case: "DISCARD_APPLICATION",
        textDir: this.textDir,
        disabled: {
          radioButton1: false,
          radioButton2: false,
        },
      };
    } else {
      data = {
        case: "DISCARD_APPLICATION",
        textDir: this.textDir,
        disabled: {
          radioButton1: false,
          radioButton2: true,
        },
      };
    }
    return data;
  }

  confirmationDialog(selectedOption: number) {
    let body = {};
    if (Number(selectedOption) === 1) {
      body = {
        case: "CONFIRMATION",
        title: this.languagelabels.title_confirm,
        message: this.languagelabels.deletePreregistration.msg_confirm,
        yesButtonText: this.languagelabels.button_confirm,
        noButtonText: this.languagelabels.button_cancel,
      };
    } else {
      body = {
        case: "CONFIRMATION",
        title: this.languagelabels.title_confirm,
        message: this.languagelabels.cancelAppointment.msg_confirm,
        yesButtonText: this.languagelabels.button_confirm,
        noButtonText: this.languagelabels.button_cancel,
      };
    }
    const dialogRef = this.openDialog(body, "400px");
    return dialogRef;
  }

  removeApplicant(preRegId: string) {
    let x: number = -1;
    for (let i of this.allApplicants) {
      x++;
      if (i.preRegistrationId == preRegId) {
        this.allApplicants.splice(x, 1);
        break;
      }
    }
  }

  async deletePreregistration(element: any) {
    let appointmentDate;
    let appointmentTime;
    if (element.regDto && element.status.toLowerCase() === "booked") {
      appointmentDate = element.regDto['appointment_date'];
      appointmentTime = element.regDto['time_slot_from'];
    }
    if (element.regDto && element.status.toLowerCase() === "booked") {
      await this.sendNotification(element.applicationID, appointmentDate, appointmentTime);
    }
    
    const subs = this.dataStorageService
      .deleteRegistration(element.applicationID)
      .subscribe(
        (response) => {
          if (!response["errors"]) {
            this.removeApplicant(element.applicationID);
            let index = this.users.indexOf(element);
            this.users.splice(index, 1);
            index = this.selectedUsers.indexOf(element);
            this.selectedUsers.splice(index, 1);
            if (this.users.length == 0) {
              localStorage.setItem("noOfApplicant", "0");
              this.onNewApplication();
              localStorage.setItem(appConstants.NEW_APPLICANT, "true");
            } else {
              this.displayMessage(
                this.languagelabels.title_success,
                this.languagelabels.deletePreregistration.msg_deleted
              );
            }
          } 
        },
        (error) => {
          this.showErrorMessage(error, this.languagelabels.title_error, this.languagelabels.deletePreregistration.msg_could_not_deleted);
        }
      );
    this.subscriptions.push(subs);
  }

  cancelAppointment(element: any) {
    let appointmentDate;
    let appointmentTime;
    if (element.regDto) {
      element.regDto.pre_registration_id = element.applicationID;
      appointmentDate = element.regDto['appointment_date'];
      appointmentTime = element.regDto['time_slot_from'];
    }
    //console.log(element.regDto);
    const subs = this.dataStorageService
      .cancelAppointment(
        new RequestModel(appConstants.IDS.booking, element.regDto),
        element.applicationID
      )
      .subscribe(
        (response) => {
          if (!response["errors"]) {
            this.displayMessage(
              this.languagelabels.title_success,
              this.languagelabels.cancelAppointment.msg_deleted
            );
            this.sendNotification(element.applicationID, appointmentDate, appointmentTime);
            const index = this.users.indexOf(element);
            this.users[index].status =
              appConstants.APPLICATION_STATUS_CODES.cancelled;
            this.users[index].appointmentDate = "-";
            this.users[index].appointmentTime = "";
          } 
        },
        (error) => {
          this.showErrorMessage(error, this.languagelabels.title_error, this.languagelabels.cancelAppointment.msg_could_not_deleted);
        }
      );
    this.subscriptions.push(subs);
  }

  onDelete(element) {
    let data = this.radioButtonsStatus(element.status);
    let dialogRef = this.openDialog(data, `460px`);
    const subs = dialogRef.afterClosed().subscribe((selectedOption) => {
      if (selectedOption && Number(selectedOption) === 1) {
        dialogRef = this.confirmationDialog(selectedOption);
        dialogRef.afterClosed().subscribe((confirm) => {
          if (confirm == true) {
            this.deletePreregistration(element);
          }
        });
      } else if (selectedOption && Number(selectedOption) === 2) {
        dialogRef = this.confirmationDialog(selectedOption);
        dialogRef.afterClosed().subscribe((confirm) => {
          if (confirm == true) {
            this.cancelAppointment(element);
          }
        });
      }
    });
    this.subscriptions.push(subs);
  }

  displayMessage(title: string, message: string) {
    const messageObj = {
      case: "MESSAGE",
      title: title,
      message: message,
    };
    this.openDialog(messageObj, "400px");
  }

  /**
   * @description This method navigate the user to demographic page to modify the existence data.
   *
   * @param {Applicant} user
   * @memberof DashBoardComponent
   */
  onModifyInformation(user: Applicant) {
    const preId = user.applicationID;
    localStorage.setItem(appConstants.MODIFY_USER, "true");
    this.disableModifyDataButton = true;
    this.onModification(preId);
  }

  /**
   * @description This method navigate the user to demmographic page on selection of modification.
   *
   * @private
   * @param {*} response
   * @param {string} preId
   * @memberof DashBoardComponent
   */
  private onModification(preId: string) {
    this.disableModifyDataButton = true;
    this.fetchedDetails = true;
    this.router.navigate([
      this.userPreferredLangCode,
      "pre-registration",
      "demographic",
      preId,
    ]);
  }

  /**
   * @description This method is called when a check box is selected.
   *
   * @param {Applicant} user
   * @param {MatCheckboxChange} event
   * @memberof DashBoardComponent
   */
  onSelectUser(user: Applicant, event: MatCheckboxChange) {
    if (event && event.checked) {
      this.selectedUsers.push(user);
    } else {
      this.selectedUsers.splice(this.selectedUsers.indexOf(user), 1);
    }
    if (this.selectedUsers.length > 0) {
      this.disableModifyAppointmentButton = false;
    } else {
      this.disableModifyAppointmentButton = true;
    }
  }

  /**
   * @description This method navigates to center selection page to book/modify the apointment
   *
   * @memberof DashBoardComponent
   */
  onModifyMultipleAppointment() {
    let url = "";
    localStorage.setItem("modifyMultipleAppointment", "true");
    if (this.selectedUsers.length === 1) {
      url = Utils.getURL(
        this.router.url,
        `pre-registration/booking/${this.selectedUsers[0].applicationID}/pick-center`,
        1
      );
      this.router.navigateByUrl(url);
    } else {
      let selectedPrids = [];
      this.selectedUsers.forEach((id) => {
        selectedPrids.push(id.applicationID);
      });
      console.log(selectedPrids);
      localStorage.setItem("multiappointment", JSON.stringify(selectedPrids));
      url = Utils.getURL(
        this.router.url,
        `pre-registration/booking/multiappointment/pick-center`,
        1
      );
      this.router.navigateByUrl(url);
    }
  }

  /**
   * @description This method is used to navigate to acknowledgement page to view the acknowledgment
   *
   * @param {Applicant} user
   * @memberof DashBoardComponent
   */
  onAcknowledgementView(user: Applicant) {
    console.log(user);
    let url = "";
    url = Utils.getURL(
      this.router.url,
      `pre-registration/summary/${user.applicationID}/acknowledgement`,
      1
    );
    this.router.navigateByUrl(url);
  }

  setUserFiles(response) {
    if (!response["errors"]) {
      this.userFile = response[appConstants.RESPONSE][appConstants.METADATA];
    } else {
      let fileModel: FileModel = new FileModel("", "", "", "", "", "", "");
      this.userFile.push(fileModel);
    }
    this.userFiles["documentsMetaData"] = this.userFile;
  }

  getColor(value: string) {
    if (value === appConstants.APPLICATION_STATUS_CODES.pending)
      return "orange";
    if (value === appConstants.APPLICATION_STATUS_CODES.booked) return "green";
    if (value === appConstants.APPLICATION_STATUS_CODES.expired) return "red";
    if (value === appConstants.APPLICATION_STATUS_CODES.cancelled) return "purple";
    if (value === appConstants.APPLICATION_STATUS_CODES.incomplete) return "maroon";
    if (value === appConstants.APPLICATION_STATUS_CODES.prefetched) return "blue";
  }

  getMargin(name: string) {
    if (name.length > 25) return "0px";
    else return "27px";
  }

  isBookingAllowed(user: Applicant) {
    if (user.status == "Expired") return false;
    const dateform = new Date(user.appointmentDateTime);
    if (dateform.toDateString() !== "Invalid Date") {
      let date1: string = user.appointmentDateTime;
      let date2: string = new Date(Date.now()).toString();
      let diffInMs: number = Date.parse(date1) - Date.parse(date2);
      let diffInHours: number = diffInMs / 1000 / 60 / 60;
      if (
        diffInHours <
        this.configService.getConfigByKey(
          appConstants.CONFIG_KEYS.preregistration_timespan_rebook
        )
      )
        return true;
      else return false;
    }
    return false;
  }

  /**
   * @description This is a dialoug box whenever an error comes from the server, it will appear.
   *
   * @private
   * @memberof DashBoardComponent
   */
   private showErrorMessage(error: any, customTitle?: string, customMsg?: string) {
    let titleOnError = this.errorLanguagelabels.errorLabel;
    if (customTitle) {
      titleOnError = customTitle;
    }
    
    let message = "";
    if (customMsg) {
      message = customMsg;
    } else {
      message = Utils.createErrorMessage(error, this.errorLanguagelabels, this.apiErrorCodes, this.configService); 
    }
    const body = {
      case: "ERROR",
      title: titleOnError,
      message: message,
      yesButtonText: this.errorLanguagelabels.button_ok,
    };
    this.dialog.open(DialougComponent, {
      width: "400px",
      data: body,
    });
  }
  
  // async sendNotification(prid, appDate, appDateTime) {
  //   let userDetails;
  //   this.dataStorageService.getUser(prid).subscribe((response) => {
  //     if (response[appConstants.RESPONSE]) {
  //       userDetails =
  //         response[appConstants.RESPONSE].demographicDetails.identity;
  //       console.log(userDetails);
  //       const notificationDto = new NotificationDtoModel(
  //         userDetails[this.name][0].value,
  //         prid,
  //         appDate,
  //         appDateTime,
  //         userDetails.phone,
  //         userDetails.email,
  //         null,
  //         true
  //       );
  //       console.log(notificationDto);
  //       const model = new RequestModel(
  //         appConstants.IDS.notification,
  //         notificationDto
  //       );
  //       let notificationRequest = new FormData();
  //       notificationRequest.append(
  //         appConstants.notificationDtoKeys.notificationDto,
  //         JSON.stringify(model).trim()
  //       );
  //       notificationRequest.append(
  //         appConstants.notificationDtoKeys.langCode,
  //         localStorage.getItem("langCode")
  //       );
  //     }
  //   },
  //   (error) => {
  //     this.showErrorMessage(error);
  //   });
  // }

  private sendNotification(prid, appDate, appDateTime)  {
    let userDetails;    
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataStorageService.getUser(prid).subscribe((response) => {
          if (response[appConstants.RESPONSE]) {
            userDetails = response[appConstants.RESPONSE].demographicDetails.identity;
            console.log(userDetails);
            const notificationDto = new NotificationDtoModel(
              userDetails[this.name][0].value,
              prid,
              appDate,
              appDateTime,
              userDetails.phone,
              userDetails.email,
              null,
              true
            );
            console.log(notificationDto);
            const model = new RequestModel(
              appConstants.IDS.notification,
              notificationDto
            );
            let notificationRequest = new FormData();
            notificationRequest.append(
              appConstants.notificationDtoKeys.notificationDto,
              JSON.stringify(model).trim()
            );
            notificationRequest.append(
              appConstants.notificationDtoKeys.langCode,
              localStorage.getItem("langCode")
            );
            this.dataStorageService
              .sendCancelNotification(notificationRequest)
              .subscribe((response) => {
                resolve(true);
              },
              (error) => {
                resolve(true);
                this.showErrorMessage(error);
            });        
          }
        },
        (error) => {
          this.showErrorMessage(error);
        })
      );
    });  
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => subscription.unsubscribe());
  }
}
