/**
 * Award XP Module - Re-engineered for Foundry VTT v14 (ApplicationV2)
 */

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class AwardXpDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.targets = this._getTargetActors();
  }

  static DEFAULT_OPTIONS = {
    id: "award-xp-dialog",
    tag: "form",
    window: {
      title: "AWARD_XP.DialogTitle",
      icon: "fas fa-trophy"
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      submit: AwardXpDialog._onSubmit
    }
  };

  static PARTS = {
    form: {
      template: "modules/foundryvtt-award-xp/templates/award-dialog.hbs"
    }
  };

  /**
   * Identifies all active player characters assigned to users or flagged as PCs
   */
  _getTargetActors() {
    const pCharacters = game.actors.filter(a => a.type === "character" && a.hasPlayerOwner);
    if (pCharacters.length > 0) return pCharacters;
    
    // Fallback to currently active user targets if no direct player characters assigned
    return game.users.filter(u => !u.isGM && u.character).map(u => u.character);
  }

  async _prepareContext(options) {
    return {
      characterCount: this.targets.length,
      characters: this.targets.map(a => ({ name: a.name, id: a.id }))
    };
  }

  static async _onSubmit(event, target) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget.closest("form"));
    const xpAmount = parseInt(formData.get("xpAmount")) || 0;
    const splitXp = formData.get("splitXp") === "on";

    if (xpAmount <= 0) {
      ui.notifications.warn(game.i18n.localize("AWARD_XP.InvalidAmount"));
      return;
    }

    const dialog = this;
    const targets = dialog.targets;
    if (!targets.length) {
      ui.notifications.warn(game.i18n.localize("AWARD_XP.NoCharacters"));
      return;
    }

    const xpPerActor = splitXp ? Math.floor(xpAmount / targets.length) : xpAmount;
    
    let chatContent = `<h3>${game.i18n.localize("AWARD_XP.ChatHeader")}</h3>`;
    chatContent += `<p>${game.i18n.format("AWARD_XP.ChatSummary", { total: xpAmount })}</p><ul>`;

    for (let actor of targets) {
      // Determine the safe data structure pathway based on the active system
      let currentXp = foundry.utils.getProperty(actor, "system.details.xp.value");
      let xpPath = "system.details.xp.value";

      // System Adaptations (Pathfinder 1 / Starfinder / System Agnostic fallbacks)
      if (currentXp === undefined) {
        if (foundry.utils.getProperty(actor, "system.attributes.xp.value") !== undefined) {
          currentXp = foundry.utils.getProperty(actor, "system.attributes.xp.value");
          xpPath = "system.attributes.xp.value";
        } else {
          // General generic fallback if standard paths miss
          currentXp = foundry.utils.getProperty(actor, "system.xp.value") || 0;
          xpPath = "system.xp.value";
        }
      }

      const newXp = (parseInt(currentXp) || 0) + xpPerActor;
      
      // Update Actor Database
      await actor.update({ [xpPath]: newXp });
      chatContent += `<li><strong>${actor.name}</strong>: +${xpPerActor} XP (Total: ${newXp})</li>`;
    }

    chatContent += `</ul>`;

    // Construct modernized v14 Chat Message
    await ChatMessage.create({
      content: chatContent,
      speaker: ChatMessage.getSpeaker({ actor: game.user.character })
    });

    this.close();
  }
}

// Hook securely into the Sidebar Actor Directory rendering cycle
Hooks.on("renderActorDirectory", (app, html, data) => {
  if (!game.user.isGM) return;

  // v14 FIX: ApplicationV2 passes an HTMLElement instead of a jQuery array. 
  // We check the type to safely handle the DOM.
  const htmlElement = html instanceof HTMLElement ? html : html[0];

  // Prevent duplicating the button on re-renders
  if (htmlElement.querySelector(".award-xp-sidebar-btn")) return;

  const buttonLabel = game.i18n.localize("AWARD_XP.ButtonLabel");
  const actionButton = document.createElement("button");
  actionButton.type = "button";
  actionButton.className = "award-xp-sidebar-btn";
  actionButton.innerHTML = `<i class="fas fa-trophy"></i> ${buttonLabel}`;

  actionButton.addEventListener("click", () => {
    new AwardXpDialog().render({force: true});
  });

  // Inject gracefully depending on the directory's v14 DOM structure 
  const headerActions = htmlElement.querySelector(".directory-header .action-buttons");
  const footer = htmlElement.querySelector(".directory-footer");

  if (headerActions) {
      headerActions.appendChild(actionButton);
  } else if (footer) {
      footer.appendChild(actionButton);
  } else {
      htmlElement.appendChild(actionButton);
  }
});