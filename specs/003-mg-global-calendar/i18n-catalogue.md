# i18n catalogue - 003-mg-global-calendar

Source of truth for the new keys. `en` and `fr` are real texts; the 12 other locales get the English text (PO-6). Status: `applied` = present in the 14 JSON files (all keys used by the code, see below); `not applied` = no consumer, rejected by `npm run i18n:check` if added. Additions from tracks 3A/3C (`dialog.shiftWithEvents`, `dialog.shiftNobodyNotified`, `wizard.openingMondayHint`) are applied too (texts in `i18n-additions-3A.md` / `-3C.md`); `dialog.cancelWithEvents` / `cancelNobodyNotified` stay for the cancel dialog. Interpolation uses `{{ name }}`.

| Key | en | fr | Consumer | Phase |
|---|---|---|---|---|
| `mg.event.cancelled` | Cancelled | Annulé | mg-admin-tab status label ('mg.event.' + status) | applied |
| `mg.calendar.banner.superAdminLow` | Only {{ count }} upcoming MG event(s) scheduled. Plan the next ones. | Seulement {{ count }} MG à venir planifié(s). Pensez à planifier les suivants. | mg-calendar-banner | applied |
| `mg.calendar.banner.superAdminLowAction` | Manage the calendar | Gérer le calendrier | mg-calendar-banner | applied |
| `mg.calendar.banner.serverAdminNone` | No upcoming MG is planned yet. A super admin has to add one to the calendar. | Aucun MG à venir n'est planifié pour le moment. Un super admin doit en ajouter un au calendrier. | mg-calendar-banner | applied |
| `mg.calendar.banner.playerNext` | Next MG starts on {{ start }}. Registration opens on {{ opening }}. | Prochain MG le {{ start }}. Les inscriptions ouvrent le {{ opening }}. | mg-calendar-banner | applied |
| `mg.calendar.banner.playerNotAnnounced` | The next MG has not been announced yet. | Le prochain MG n'a pas encore été annoncé. | mg-calendar-banner | applied |
| `mg.calendar.banner.cancelledNotice` | The MG of {{ start }} has been cancelled. | Le MG du {{ start }} a été annulé. | mg-calendar-banner | applied |
| `superAdmin.dashboard.manageCalendar` | Calendar | Calendrier | dashboard quick-action card | applied |
| `superAdmin.dashboard.manageCalendarDesc` | Plan and manage the global MG calendar | Planifier et gérer le calendrier global des MG | dashboard quick-action card | applied |
| `superAdmin.calendar.title` | MG calendar | Calendrier MG | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.subtitle` | Plan Mightiest Governor events for every server | Planifiez les Mightiest Governor de tous les serveurs | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.newMg` | New MG | Nouveau MG | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.newOther` | New event | Nouvel événement | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.futureSection` | Upcoming | À venir | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.historySection` | History | Historique | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.empty` | No calendar entry yet. | Aucune entrée au calendrier pour le moment. | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.loadFailed` | Failed to load the calendar. | Échec du chargement du calendrier. | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.type.mg` | Mightiest Governor | Mightiest Governor | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.type.pvp` | PvP | PvP | super-admin-calendar.page / list | applied |
| `superAdmin.calendar.state.planned` | Planned | Planifié | calendar-entry-list | applied |
| `superAdmin.calendar.state.registrationOpen` | Registration open | Inscriptions ouvertes | calendar-entry-list | applied |
| `superAdmin.calendar.state.awaitingStart` | Awaiting start | En attente du début | calendar-entry-list | applied |
| `superAdmin.calendar.state.ongoing` | In progress | En cours | calendar-entry-list | applied |
| `superAdmin.calendar.state.finished` | Finished | Terminé | calendar-entry-list | applied |
| `superAdmin.calendar.state.cancelled` | Cancelled | Annulé | calendar-entry-list | applied |
| `superAdmin.calendar.list.columnType` | Type | Type | calendar-entry-list | not applied: no consumer (list is not a table) |
| `superAdmin.calendar.list.columnDates` | Dates | Dates | calendar-entry-list | not applied: no consumer (list is not a table) |
| `superAdmin.calendar.list.columnState` | Status | Statut | calendar-entry-list | not applied: no consumer (list is not a table) |
| `superAdmin.calendar.list.columnServers` | Servers | Serveurs | calendar-entry-list | applied |
| `superAdmin.calendar.list.columnRegistrations` | Registrations | Inscriptions | calendar-entry-list | applied |
| `superAdmin.calendar.list.shift` | Shift | Décaler | calendar-entry-list | applied |
| `superAdmin.calendar.list.cancel` | Cancel | Annuler | calendar-entry-list | applied |
| `superAdmin.calendar.list.edit` | Edit | Modifier | calendar-entry-list | applied |
| `superAdmin.calendar.list.delete` | Delete | Supprimer | calendar-entry-list | applied |
| `superAdmin.calendar.list.registrationOpenOn` | Registration opens on {{ date }} | Inscriptions ouvertes le {{ date }} | calendar-entry-list | applied |
| `superAdmin.calendar.list.closesOn` | Closes on {{ date }} | Clôture le {{ date }} | calendar-entry-list | applied |
| `superAdmin.calendar.wizard.title` | Add MG events | Ajouter des MG | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.stepDates` | Dates | Dates | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.stepPreview` | Preview | Aperçu | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.stepResult` | Result | Résultat | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.openingMonday` | Registration opening Monday | Lundi d'ouverture des inscriptions | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.duplicate` | Duplicate every 2 weeks | Dupliquer toutes les 2 semaines | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.weeks` | Number of weeks | Nombre de semaines | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.weeksHint` | Even number, from 2 to 26 | Nombre pair, de 2 à 26 | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.previewOpening` | Opening | Ouverture | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.previewClosing` | Closing | Clôture | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.previewStart` | Start | Début | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.previewEnd` | End | Fin | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.confirm` | Create | Créer | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.resultTitle` | Result per date | Résultat par date | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.outcome.created` | Created | Créé | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.outcome.alreadyExists` | Already exists, ignored | Existe déjà, ignoré | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.outcome.rejectedNotMonday` | Refused: not a Monday | Refusé : ce n'est pas un lundi | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.outcome.rejectedOpeningPassed` | Refused: opening date already passed | Refusé : date d'ouverture déjà passée | mg-entry-wizard | applied |
| `superAdmin.calendar.wizard.outcome.rejectedTooClose` | Refused: less than 14 days from another MG | Refusé : moins de 14 jours d'un autre MG | mg-entry-wizard | applied |
| `superAdmin.calendar.dialog.shiftTitle` | Shift this MG | Décaler ce MG | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.shiftNewOpening` | New opening Monday | Nouveau lundi d'ouverture | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.shiftMovedList` | Entries that will move | Entrées qui seront décalées | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.shiftNotice` | Every following MG is moved by the same number of weeks. | Tous les MG suivants sont décalés du même nombre de semaines. | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.cancelTitle` | Cancel this MG | Annuler ce MG | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.cancelNoEvent` | No server has opened this MG yet. It will simply be cancelled. | Aucun serveur n'a encore ouvert ce MG. Il sera simplement annulé. | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.cancelWithEvents` | This MG is open on {{ servers }} server(s) with {{ registrations }} registration(s). They will be cancelled. | Ce MG est ouvert sur {{ servers }} serveur(s) avec {{ registrations }} inscription(s). Elles seront annulées. | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.cancelNobodyNotified` | Players are not notified: they will see a notice in the app. | Les joueurs ne sont pas notifiés : ils verront un avis dans l'application. | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.deleteTitle` | Delete this entry | Supprimer cette entrée | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.deleteBody` | This entry will be permanently deleted. | Cette entrée sera supprimée définitivement. | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.confirm` | Confirm | Confirmer | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.dialog.back` | Back | Retour | calendar-confirm-dialog / mg-shift-dialog | applied |
| `superAdmin.calendar.form.type` | Type | Type | other-entry-form | applied |
| `superAdmin.calendar.form.title` | Title | Titre | other-entry-form | applied |
| `superAdmin.calendar.form.allDay` | All day | Toute la journée | other-entry-form | applied |
| `superAdmin.calendar.form.startsAt` | Starts at (UTC) | Début (UTC) | other-entry-form | applied |
| `superAdmin.calendar.form.endsAt` | Ends at (UTC) | Fin (UTC) | other-entry-form | applied |
| `superAdmin.calendar.form.utcHint` | Dates and times are entered in UTC. | Les dates et heures sont saisies en UTC. | other-entry-form | applied |
| `superAdmin.calendar.form.save` | Save | Enregistrer | other-entry-form | applied |
| `superAdmin.calendar.errors.forbidden` | You are not allowed to manage the calendar. | Vous n'avez pas le droit de gérer le calendrier. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.invalidInput` | Invalid request. Check the values and try again. | Requête invalide. Vérifiez les valeurs et réessayez. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.notFound` | This calendar entry no longer exists. | Cette entrée du calendrier n'existe plus. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.notMonday` | The date must be a Monday. | La date doit être un lundi. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.openingPassed` | The registration opening date has already passed. | La date d'ouverture des inscriptions est déjà passée. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.alreadyExists` | An MG already exists on this date. | Un MG existe déjà à cette date. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.tooClose` | Two MG must be at least 14 days apart. | Deux MG doivent être espacés d'au moins 14 jours. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.notShiftable` | This entry cannot be shifted. | Cette entrée ne peut pas être décalée. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.notCancellable` | This entry cannot be cancelled. | Cette entrée ne peut pas être annulée. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.unknown` | Something went wrong. Please try again. | Une erreur est survenue. Veuillez réessayer. | calendar.service (MG_CAL_ERROR_KEYS) | applied |
| `superAdmin.calendar.errors.weeksEven` | The number of weeks must be even. | Le nombre de semaines doit être pair. | mg-entry-wizard | applied |
| `superAdmin.calendar.errors.weeksRange` | The number of weeks must be between 2 and 26. | Le nombre de semaines doit être compris entre 2 et 26. | mg-entry-wizard | applied |
| `superAdmin.calendar.errors.endsAfterStart` | The end must be after the start. | La fin doit être postérieure au début. | other-entry-form | applied |
| `superAdmin.calendar.errors.reason.cancelled` | This entry is cancelled. | Cette entrée est annulée. | dynamic prefix (SQL reason, NOT_SHIFTABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.read_only` | This entry has started or finished and can no longer be changed. | Cette entrée a commencé ou est terminée et ne peut plus être modifiée. | dynamic prefix (SQL reason, NOT_SHIFTABLE / NOT_CANCELLABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.event_not_open` | An event linked to this entry is no longer open for registration. | Un événement lié à cette entrée n'est plus ouvert aux inscriptions. | dynamic prefix (SQL reason, NOT_SHIFTABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.must_move_later` | An entry whose registration is open can only be moved later. | Une entrée dont les inscriptions sont ouvertes ne peut qu'être reportée plus tard. | dynamic prefix (SQL reason, NOT_SHIFTABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.following_entry_opened` | A following entry has already opened, so the shift is refused. | Une entrée suivante est déjà ouverte : le décalage est refusé. | dynamic prefix (SQL reason, NOT_SHIFTABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.event_date_conflict` | The new dates conflict with an existing server event. | Les nouvelles dates entrent en conflit avec un événement de serveur existant. | dynamic prefix (SQL reason, NOT_SHIFTABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.already_cancelled` | This entry is already cancelled. | Cette entrée est déjà annulée. | dynamic prefix (SQL reason, NOT_CANCELLABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.event_ongoing_or_finished` | An event linked to this entry is in progress or finished. | Un événement lié à cette entrée est en cours ou terminé. | dynamic prefix (SQL reason, NOT_CANCELLABLE), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.empty_array` | No date provided. | Aucune date fournie. | dynamic prefix (SQL reason, INVALID_INPUT), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.too_many` | Too many dates in one request. | Trop de dates dans une seule requête. | dynamic prefix (SQL reason, INVALID_INPUT), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.null_element` | One of the dates is empty. | Une des dates est vide. | dynamic prefix (SQL reason, INVALID_INPUT), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.duplicate` | The same date appears twice. | La même date apparaît deux fois. | dynamic prefix (SQL reason, INVALID_INPUT), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.errors.reason.zero_offset` | The new date is the same as the current one. | La nouvelle date est identique à l'actuelle. | dynamic prefix (SQL reason, INVALID_INPUT), first source use in phase 3 (error mapping in the page) | applied |
| `superAdmin.calendar.saved` | Entry saved. | Entrée enregistrée. | super-admin-calendar.page snackbars | applied |
| `superAdmin.calendar.cancelled` | Entry cancelled. | Entrée annulée. | super-admin-calendar.page snackbars | applied |
| `superAdmin.calendar.deleted` | Entry deleted. | Entrée supprimée. | super-admin-calendar.page snackbars | applied |
| `superAdmin.calendar.shifted` | Entries shifted. | Entrées décalées. | super-admin-calendar.page snackbars | applied |
