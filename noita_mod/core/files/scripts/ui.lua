if initialized == nil then initialized = false; end

if not initialized then
    wand_cache = {}
    initialized = true
    dofile_once("mods/noita-together/files/scripts/item_list.lua")
    dofile_once("data/scripts/gun/procedural/wands.lua")
    dofile_once( "data/scripts/lib/utilities.lua" )
    local gui = gui or GuiCreate();
    local gui_id = 6969
    GuiStartFrame( gui );
    local screen_width, screen_height = GuiGetScreenDimensions(gui)
    local show_player_list = false
    local show_bank = false
    local show_message = false
    local caps_lock = false
    local radar_on = true
    local hidden_chat = false
    local show_wands = false
    local hoveredFrames = 0
    local last_player_msg = 0
    local bankfilter = ""
    local player_msg = ""
    local filteredItems = {}
    local wand_displayer = {}
    local gold_amount = "1"
    local bank_offset = 0
    local last_inven_is_open = false
    local selected_player = ""
    local numbers = {"1", "2", "3", "4", "5", "6", "7", "8", "9", "0"}
    local alphabet = {"q","w","e","r","t","y","u","i","o","p","a","s","d","f","g","h","j","k","l","z","x","c","v","b","n","m"}

    --"invalid/unknown spell" used for UI display when someone put a spell we dont have (mods or beta) into the bank
    InvalidSpellSprite = {
        name = "$noitatogether_bank_illegal_spell",
        sprite = "mods/noita-together/files/ui/illegal_spell.png",
        type = 5, --ACTION_TYPE_OTHER = 5
        nt_illegal = true
    }

    local is_hovering_message_input = false --flag if hovering over message input textbox
    local is_hovering_bank_filter = false --flag if hovering over bank filter textbox
    local is_hovering_bank_gold = false --flag if hovering over bank gold textbox
    local was_hovering_textbox = false --flag if we disabled controls while hovering a textbox

    local _wand_tooltip = {
        "$inventory_shuffle",
        "$inventory_actionspercast",
        "$inventory_castdelay",
        "$inventory_rechargetime",
        "$inventory_manamax",
        "$inventory_manachargespeed",
        "$inventory_capacity",
        "$inventory_spread"
    }
    local biome_sprites = {
        ["Mountain"] = "mountain.png",
        ["$biome_coalmine"] = "coalmine.png",
        ["$biome_coalmine_alt"] = "coalmine_alt.png",
        ["$biome_excavationsite"] = "excavationsite.png",
        ["$biome_fungicave"] = "fungicave.png",
        ["$biome_rainforest"] = "rainforest.png",
        ["$biome_snowcave"] = "snowcave.png",
        ["$biome_snowcastle"] = "snowcastle.png",
        ["$biome_vault"] = "vault.png",
        ["$biome_crypt"] = "crypt.png",
        ["$biome_holymountain"] = "holymountain.png",
        ["$biome_boss_victoryroom"] = "the_work.png",

        ["$biome_boss_arena"] = "laboratory.png",
        ["$biome_desert"] = "desert.png",
        ["$biome_dragoncave"] = "dragoncave.png",
        ["$biome_gold"] = "the_gold.png",
        ["$biome_lake"] = "lake.png",
        ["$biome_sandcave"] = "sandcave.png",
        ["$biome_tower"] = "tower.png",
        ["$biome_vault_frozen"] = "vault_frozen.png",
        ["$biome_clouds"] = "cloudscape.png",
        ["$biome_liquidcave"] = "ancient_laboratory.png",
        ["$biome_secret_lab"] = "alchemistboss.png",
        ["$biome_orbroom"] = "orbroom.png",
        ["$biome_wizardcave"] = "wizardcave.png",
        ["$biome_rainforest_dark"] = "lukki.png",
        ["$biome_mestari_secret"] = "wizardboss.png",
        ["$biome_ghost_secret"] = "snowy_boss.png",
        ["$biome_winter_caves"] = "snowy_chasm.png",
        ["$biome_the_end"] = "hell_work.png", --maybe no worky
        ["$biome_the_end_sky"] = "sky_work.png", --maybe no worky
        ["$biome_wandcave"] = "wandcave.png",
        ["$biome_winter"] = "winter.png",
        ["$biome_fun"] = "fun.png",
        ["$biome_robobase"] = "robobase.png",
    }
    local selectedTab = "all"
    local bankTabs = {
        {id="all", icon = "all.png"},
        {id="wands", icon = "wands.png"},
        {id="spells", icon = "spells.png"},
        {id="items", icon = "items.png"}
    }
    local sortKeyHax = "" -- dont do this eww
    local function sort_shuffle(a,b)
        if (a.stats == nil or b.stats == nil) then return false end
        return not a.stats[sortKeyHax] and b.stats[sortKeyHax]
    end

    local function sort_bicc(a,b)
        if (a.stats == nil or b.stats == nil) then return false end
        return a.stats[sortKeyHax] > b.stats[sortKeyHax]
    end

    local function sort_smol(a,b)
        if (a.stats == nil or b.stats == nil) then return false end
        return a.stats[sortKeyHax] < b.stats[sortKeyHax]
    end
    
    local tabToggles = {
        all={},
        wands={
            {icon="mods/noita-together/files/ui/wands_sorting/icon_gun_shuffle-1.png", tooltip="Shuffle", key="shuffleDeckWhenEmpty", enabled=true, fn=sort_shuffle},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_gun_actions_per_round-1.png", tooltip="Casts", key="actionsPerRound", enabled=true, fn=sort_smol},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_fire_rate_wait-1.png", tooltip="Cast Delay", key="fireRateWait", enabled=true, fn=sort_smol},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_reload_time-1.png", tooltip="Recharge Time", key="reloadTime", enabled=true, fn=sort_smol},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_mana_max-1.png", tooltip="Mana Max", key="manaMax", enabled=false, fn=sort_bicc},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_mana_charge_speed-1.png", tooltip="Mana Charge Speed", key="manaChargeSpeed", enabled=false, fn=sort_bicc},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_gun_capacity-1.png", tooltip="Capacity", key="deckCapacity", enabled=false, fn=sort_bicc},
            {icon="mods/noita-together/files/ui/wands_sorting/icon_spread_degrees-1.png", tooltip="Spread", key="spreadDegrees", enabled=false, fn=sort_smol},
        },
        spells={
            {icon="mods/noita-together/files/ui/buttons/light_bullet_trigger.png", tooltip="Projectiles", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/polymorph_field.png", tooltip="Static Projectiles", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/bloodlust.png", tooltip="Modifiers", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/burst_4.png", tooltip="Multicasts", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/material_water.png", tooltip="Materials", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/alpha.png", tooltip="Other", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/x_ray.png", tooltip="Utility", enabled=true},
            {icon="mods/noita-together/files/ui/buttons/torch.png", tooltip="Passive", enabled=true},
        },
        items={}
    }
    local function reset_id()
        gui_id = 6969
    end
    
    local function next_id()
        local id = gui_id
        gui_id = gui_id + 1
        return id
    end

    local function previous_data( gui )
        local left_click,right_click,hover,x,y,width,height,draw_x,draw_y,draw_width,draw_height = GuiGetPreviousWidgetInfo( gui );
        if left_click == 1 then left_click = true; elseif left_click == 0 then left_click = false; end
        if right_click == 1 then right_click = true; elseif right_click == 0 then right_click = false; end
        if hover == 1 then hover = true; elseif hover == 0 then hover = false; end
        return left_click,right_click,hover,x,y,width,height,draw_x,draw_y,draw_width,draw_height;
    end

    --TODO Move me to some common file, refactor other things that lock/unlock controls (run start?)
    local function LockPlayer()
        local player = GetPlayer()
        if (player == nil) then
            return
        end

        local controls = EntityGetFirstComponentIncludingDisabled(player, "ControlsComponent")
        if(controls ~= nil) then
            ComponentSetValue2(controls, "enabled", false)
        end
    end

    local function UnlockPlayer()
        local player = GetPlayer()
        if (player == nil) then
            return
        end

        local controls = EntityGetFirstComponentIncludingDisabled(player, "ControlsComponent")
        if(controls ~= nil) then
            ComponentSetValue2(controls, "enabled", true)
        end
    end

    local function follow_player( userId, name )
        local ghosts = EntityGetWithTag("nt_ghost") or {}
        for _, ghost in ipairs(ghosts) do
            local var_comp = get_variable_storage_component(ghost, "userId")
            local user_id = ComponentGetValue2(var_comp, "value_string")
            if (user_id == userId) then
                if (EntityHasTag(ghost, "nt_follow")) then
                    EntityRemoveTag(ghost, "nt_follow")
                    GamePrint(GameTextGet("$noitatogether_stop_follow_player", (name or "")))
                else
                    EntityAddTag(ghost, "nt_follow")
                    GamePrint(GameTextGet("$noitatogether_follow_player", (name or "")))
                end
            end
        end
    end

    local function wand_tooltip(wand)
        local ret = {
            wand.shuffleDeckWhenEmpty and "$menu_yes" or "$menu_no",
            tostring(wand.actionsPerRound),
            string.format("%.2f",wand.fireRateWait / 60),
            string.format("%.2f",wand.reloadTime / 60),
            string.format("%.0f",wand.manaMax),
            string.format("%.0f",wand.manaChargeSpeed),
            tostring(wand.deckCapacity),
            GameTextGet("$inventory_degrees", string.format("%.2f",wand.spreadDegrees))
        }
        return ret
    end

    local function flask_info(flask, chest)
        local materials = ""
        local d = 10
        if (chest) then d = 15 end
        for i, inv in ipairs(flask) do
            local translated_text = ""
            translated_text = GameTextGetTranslatedOrNot(CellFactory_GetUIName(inv.id))
            materials = materials .. string.format("%s%s %s\n",
            math.ceil(inv.amount / d),
            "%",
            translated_text)
        end
        return materials
    end

    local function change_bank_offset(num, pages)
        local offset = bank_offset + num
        --clamp to min/max pages of bank
        if (offset > pages) then
            offset = pages
        elseif (offset < 0) then
            offset = 0
        end

        bank_offset = offset
    end

    local function get_wand_sprite(filename)
        if (wand_cache[filename] ~= nil) then return wand_cache[filename] end
        local wand = {}
        wand.sprite = filename
        if (filename:sub(-#".xml") == ".xml") then
            wand.sprite = _ModTextFileGetContent(filename):match([[filename="([^"]+)]])
        end

        local w, h = GuiGetImageDimensions(gui, wand.sprite, 1)
        local ox = ((w - 20) / 2) * -1
        local oy = ((h - 20) / 2) * -1
        wand.ox = ox
        wand.oy = oy
        wand_cache[filename] = wand
        return wand_cache[filename]
    end

    local function render_wand(item, x, y, nx, ny, show_owner, force)
        GuiZSetForNextWidget(gui, 7)
        local wand = get_wand_sprite(item.stats.sprite)
        if (not force) then
            GuiImage(gui, next_id(), x + wand.ox, y + wand.oy, wand.sprite, 1, 1, 1)
        end
        local left, right, hover = previous_data(gui)
        if (hover or force) then

            local player = PlayerList[item.sentBy] or {name=GameTextGet("$noitatogether_me")}
            local nox, nyx = 5, 0
            GuiZSetForNextWidget(gui, 6)
            GuiImageNinePiece(gui, next_id, nx, ny, 160, 160, 1)
            GuiImage(gui, next_id(), nx + 125, ny + 80, wand.sprite, 1, 2.2, 0, -1.5708)
            GuiZSetForNextWidget(gui, 5)
            if (not force) then
                GuiText(gui, nx + nox, ny + nyx, GameTextGet("$noitatogether_sent_by_player", player.name))
            end
            nyx = nyx + 15
            
            for key, value in ipairs(wand_tooltip(item.stats))do
                GuiZSetForNextWidget(gui, 5)
                GuiText(gui, nx + nox, ny + nyx, _wand_tooltip[key])
                GuiZSetForNextWidget(gui, 5)
                GuiText(gui, nx + 80, ny + nyx, tostring(value))
                nyx = nyx + 10
            end
            nyx = nyx + 10
            local always_casts = item.alwaysCast or {}
            local deck = item.deck or {}
            local illegal = false
            if (#always_casts > 0) then
                GuiZSetForNextWidget(gui, 5)
                GuiText(gui, nx + 5, ny + nyx, "$inventory_alwayscasts")
                nox = 60
                for index, value in ipairs(always_casts) do
                    if (value.gameId ~= "0") then
                        GuiZSetForNextWidget(gui, 5)
                        local spell = SpellSprites[value.gameId] or InvalidSpellSprite
                        illegal = illegal or spell.nt_illegal
                        GuiImage(gui, next_id(), nx + nox, ny + nyx, spell.sprite, 1, 0.8, 0.8)
                        nox = nox + 15
                    end
                end
                nox = 5
                nyx = nyx + 15
            end
            for index, value in ipairs(deck) do
                if (value.gameId ~= "0") then
                    GuiZSetForNextWidget(gui, 5)
                    local spell = SpellSprites[value.gameId] or InvalidSpellSprite
                    illegal = illegal or spell.nt_illegal
                    GuiImage(gui, next_id(), nx + nox, ny + nyx, spell.sprite, 1, 0.8, 0.8)
                    --This doesnt show charges if it was put in with unlimited spells, but it will come out full anyway
                    --TODO this doesnt look nice because the text is large compared to the spell icons. Also its not the same font as used on vanilla spell icons
                    if value.usesRemaining and value.usesRemaining >= 0 then
                        GuiText(gui, nx + nox + 1, ny + nyx - 8, value.usesRemaining)
                    end
                    nox = nox + 15
                    if (index % 10 == 0) then
                        nyx = nyx + 20
                        nox = 5
                    end
                end
            end

            --display illegal message if any of the spells were illegal
            --TODO this doesnt scale the UI to fit the text...
            if illegal and not force then
                nox = 5
                nyx = nyx + 20
                GuiTextMultiLine(gui, nx + nox, ny + nyx, GameTextGet("$noitatogether_bank_illegal_wand"))
            end
        end
    end

    local function draw_item_sprite(item, x,y)
        GuiZSetForNextWidget(gui, 8)
        if (item.gameId ~= nil) then --spell
            local player = PlayerList[item.sentBy] or {name=GameTextGet("$noitatogether_me")}
            local spell_description = ""
            if (player ~= nil) then
                spell_description = spell_description .. "\n" .. GameTextGet("$noitatogether_sent_by_player", player.name)
            end
            local spell = SpellSprites[item.gameId] or InvalidSpellSprite
            if spell.nt_illegal then
                spell_description = item.gameId .. "\n" .. spell_description .. "\n" .. GameTextGet("$noitatogether_bank_illegal_spell_desc")
            end
            GuiImage(gui, next_id(), x +2, y +2,  spell.sprite, 1,1,1)--SpellSprites[item.gameId], 1)
            GuiTooltip(gui, spell.name, spell_description)
            --This doesnt show charges if it was put in with unlimited spells, but it will come out full anyway
            --TODO this is not the same font as used on vanilla spel icons???
            --ignore for the dummy illegal spell, even if the banked item has a charge count
            if not spell.nt_illegal and item.usesRemaining >= 0 then
                GuiText(gui, x+1, y, item.usesRemaining)
            end
        elseif (item.stats ~= nil) then --wand
            local nx, ny = (screen_width / 2) - 260, (screen_height/2) - 95
            render_wand(item, x, y, nx, ny, true)      
        elseif (item.content ~= nil) then --flask
            local player = PlayerList[item.sentBy] or {name=GameTextGet("$noitatogether_me")}
            local container_name = item.isChest and GameTextGet("$item_powder_stash") or GameTextGet("$item_potion")
            if (player ~= nil) then
                container_name = container_name .. "\n" .. GameTextGet("$noitatogether_sent_by_player", player.name)
            end
            GuiZSetForNextWidget(gui, 7)
            if (item.isChest) then
                GuiImage(gui, next_id(), x + 2, y + 2, "data/ui_gfx/items/material_pouch.png", 1, 1, 1)
            else
                GuiColorSetForNextWidget(gui, item.color.r, item.color.g, item.color.b, 1)
                GuiImage(gui, next_id(), x + 2, y + 2, "data/ui_gfx/items/potion.png", 1, 1, 1)
            end
            GuiTooltip(gui, container_name, flask_info(item.content, item.isChest))
        elseif (item.path ~= nil) then
            local player = PlayerList[item.sentBy] or {name=GameTextGet("$noitatogether_me")}
            local item_name = nt_items[item.path] and nt_items[item.path].name or ""
            item_name = GameTextGetTranslatedOrNot(item_name)
            if (player ~= nil) then
                item_name = item_name .. "\n" .. GameTextGet("$noitatogether_sent_by_player", player.name)
            end
            local w, h = GuiGetImageDimensions(gui, item.sprite, 1)
            local ox = ((w - 20) / 2) * -1
            local oy = ((h - 20) / 2) * -1
            GuiZSetForNextWidget(gui, 7)
            GuiImage(gui, next_id(), x + ox, y + oy, item.sprite, 1, 1, 1)
            GuiTooltip(gui, item_name, "")
        end
    end

    local function test_wand_spells_legal(t)
        if (not t) or (#t == 0) then
            return true --no spells is still legal i guess
        end

        for index, value in ipairs(t) do
            if (value.gameId ~= "0") then
                if not SpellSprites[value.gameId] then
                    return false --illegal!
                end
            end
        end

        --no problems
        return true
    end

    local function draw_bank_item(x, y, i)
        local item_offset = i + bank_offset * 40
        local item = filteredItems[item_offset]
        if (item ~= nil) then
            draw_item_sprite(item, x, y)
        end

        GuiZSetForNextWidget(gui, 9)
        if (GuiImageButton(gui, next_id(), x, y, "", "mods/noita-together/files/ui/slot.png")) then
            if (item ~= nil) then
                --check for illegal items
                local legal = true

                --spells
                if item.gameId ~= nil and not SpellSprites[item.gameId] then
                   legal = false
                end

                --wands
                if item.stats ~= nil then
                    legal = legal and test_wand_spells_legal(item.alwaysCasts) and test_wand_spells_legal(item.deck)
                end

                --TODO flasks

                if legal then
                    SendWsEvent({event="PlayerTake", payload={id=item.id}})    
                else
                    GamePrint(GameTextGet("$noitatogether_bank_take_item_failed")) 
                end
            end
        end
    end

    local function filterItems()
        local filterkey = bankfilter
        if (filterkey == "" and selectedTab == "all") then
            filteredItems = BankItems
            return
        end
        local idk = {}
        local ret = {}

        for _, item in ipairs(BankItems) do
            --not sure if we really need to explicitly check all of these but may as well for now
            if (selectedTab == "all") and (item.stats or item.gameId or item.path or item.content) then
                table.insert(idk, item)
            elseif ((selectedTab == "wands") and item.stats ~= nil) then
                table.insert(idk, item)
            elseif ((selectedTab == "spells") and item.gameId ~= nil) then
                local spell = SpellSprites[item.gameId] or InvalidSpellSprite
                --ACTION_TYPE_OTHER = 5
                if (tabToggles[selectedTab][(spell.type or 5) + 1].enabled) then
                    table.insert(idk, item)
                end
            elseif ((selectedTab == "items") and (item.path ~= nil or item.content ~= nil)) then
                table.insert(idk, item)
            end
        end
        if (selectedTab == "wands") then
            local wandFilters = tabToggles[selectedTab]
            for _, filter in pairs(wandFilters) do
                if (filter.enabled) then 
                    sortKeyHax = filter.key -- ewww dont do
                    table.sort(idk, filter.fn)
                end
            end
        end

        if (filterkey == "") then 
            filteredItems = idk
            return
        end

        for _, item in ipairs(idk) do
            if (item.gameId ~= nil) then -- spell
                local spell = SpellSprites[item.gameId] or InvalidSpellSprite
                if (string.find(string.lower(spell.name), string.lower(filterkey))) then
                    table.insert(ret, item)
                end
            elseif (item.stats ~= nil) then -- wand
                local found = false
                for _, action in ipairs(item.alwaysCast or {}) do
                    local spell = SpellSprites[action.gameId] or InvalidSpellSprite
                    if (spell ~= nil) then
                        if (string.find(string.lower(spell.name), string.lower(filterkey))) then
                            found = true
                        end
                    end
                end
                for _, action in ipairs(item.deck or {}) do
                    local spell = SpellSprites[action.gameId] or InvalidSpellSprite
                    if (spell ~= nil) then
                        if (string.find(string.lower(spell.name), string.lower(filterkey))) then
                            found = true
                        end
                    end
                end

                if (found) then
                    table.insert(ret, item)
                end
            elseif (item.content ~= nil) then -- flask
                --TODO will localizing these mess with filtering?
                local container = item.isChest and "Powder Stash\n" or "Flask\n"
                container = container .. flask_info(item.content, item.isChest)
                if (string.find(string.lower(container), string.lower(filterkey))) then
                    table.insert(ret, item)
                end
            elseif (item.path ~= nil) then -- entity item
                local item_name = nt_items[item.path] and nt_items[item.path].name or ""
                item_name = GameTextGetTranslatedOrNot(item_name)
                if (string.find(string.lower(item_name), string.lower(filterkey))) then
                    table.insert(ret, item)
                end
            end
        end

        filteredItems = ret
    end

    local function sortItems()
        table.sort(BankItems, function (a, b)
            if (a.gameId) then
                if (b.gameId) then return a.gameId < b.gameId end
                if (b.stats) then return false end
                if (b.content) then return true end
                if (b.path) then return true end
            elseif (a.stats) then
                if (b.gameId) then return true end
                if (b.stats) then return a.stats.sprite < b.stats.sprite end
                if (b.content) then return true end
                if (b.path) then return true end
            elseif (a.content) then
                if (b.gameId) then return false end
                if (b.stats) then return false end
                if (b.content) then return false end
                if (b.path) then return true end
            elseif (a.path) then
                return false
            end
            return false
        end)
    end

    local function draw_tab(id, icon, x, y)
        local background = "deselected.png"
        if (id == selectedTab) then background = "selected.png" end
        GuiZSetForNextWidget(gui, 9)
        GuiImage(gui, next_id(), x-8, y-8, "mods/noita-together/files/ui/" .. background, 1, 1, 1)
        GuiZSetForNextWidget(gui, 8)
        if (GuiImageButton(gui, next_id(), x-3, y-3, "", "mods/noita-together/files/ui/" .. icon)) then
            selectedTab = id
        end
        GuiTooltip(gui, id, "")
    end

    local function draw_item_bank()
        local pos_x, pos_y = (screen_width / 3), (screen_height/4) - 30
        local offx, offy = 35, 50
        GuiOptionsAdd(gui, GUI_OPTION.NoPositionTween)
        GuiZSetForNextWidget(gui, 12)
        GuiImageNinePiece(gui, next_id(), pos_x, pos_y, 254, 224, 1, "mods/noita-together/files/ui/outer.png")
        GuiZSetForNextWidget(gui, 10)
        GuiImageNinePiece(gui, next_id(), pos_x+33, pos_y+28, 200, 180, 1, "mods/noita-together/files/ui/middle.png")
        GuiZSetForNextWidget(gui, 9)
        if (GuiImageButton(gui, next_id(), pos_x + 243, pos_y, "", "mods/noita-together/files/ui/close.png")) then
            show_bank = not show_bank
        end
        GuiZSetForNextWidget(gui, 9)
        GuiText(gui, pos_x + 26, pos_y + 5, "$noitatogether_bank_title")
        GuiZSetForNextWidget(gui, 9)
        if (GuiImageButton(gui, next_id(), pos_x + 52, pos_y + 5, "", "mods/noita-together/files/ui/sort.png")) then
            sortItems()
        end
        GuiTooltip(gui, "$noitatogether_bank_sort", "")
        local tabOff = 0
        for _, tab in ipairs(bankTabs) do
            draw_tab(tab.id, tab.icon, pos_x+11, pos_y + 34 + tabOff)
            tabOff = tabOff + 28
        end
        local offy_hax = false
        for i, toggle in ipairs(tabToggles[selectedTab]) do
            GuiZSetForNextWidget(gui, 9)
            local left_click, right_click = GuiImageButton(gui, next_id(), pos_x + offx+1, pos_y + 25, "", "mods/noita-together/files/ui/buttons/button.png")
            if left_click then
                tabToggles[selectedTab][i].enabled = not toggle.enabled
            elseif right_click then
                for j,toggle2 in ipairs(tabToggles[selectedTab]) do
                    tabToggles[selectedTab][j].enabled = (i == j)
                end
            end
            GuiTooltip(gui, toggle.tooltip, "")
            GuiZSetForNextWidget(gui, 8)
            if (toggle.enabled == false) then
                GuiColorSetForNextWidget( gui, 0.5, 0.5, 0.5, 0.5 )
            end
            GuiImage(gui, next_id(), pos_x + offx+3, pos_y + 27, toggle.icon, 1, 1, 1)
            if (i > 1 and not offy_hax) then 
                offy = offy + 10 
                offy_hax = true
            end 
            offx = offx + 25
        end
        offx = 35
        GuiZSetForNextWidget(gui, 9)
        GuiText(gui, pos_x + 119, pos_y + 5, "$noitatogether_bank_filter")
        GuiZSetForNextWidget(gui, 9)
        bankfilter = GuiTextInput(gui, next_id(), pos_x + 140, pos_y + 5, bankfilter, 100, 32)

        --store hover state
        local _, _, _hover = GuiGetPreviousWidgetInfo(gui)
        is_hovering_bank_filter = _hover

        if (bankfilter == " ") then bankfilter = "" end
        filterItems()
        local pages = math.floor(#filteredItems / 40)
        if (bank_offset > pages) then bank_offset = pages end
        for i = 1, 40 do
            draw_bank_item(pos_x + offx,pos_y + offy, i)
            
            offx = offx + 25

            if (i % 8 == 0) then
                offx = 35
                offy = offy + 25
            end
        end
        if (GuiImageButton(gui, next_id(), pos_x + 45, pos_y + 190, "", "mods/noita-together/files/ui/arrows/arrow_back.png")) then
            change_bank_offset(-10, pages)
        end
        if (GuiImageButton(gui, next_id(), pos_x + 85, pos_y + 190, "", "mods/noita-together/files/ui/arrows/arrow_back_alt.png")) then
            change_bank_offset(-1, pages)
        end
        GuiText(gui, pos_x + 126, pos_y + 195, tostring(bank_offset+1) .. "/" .. tostring(pages+1))
        if GuiImageButton(gui, next_id(), pos_x + 160, pos_y + 190, "", "mods/noita-together/files/ui/arrows/arrow_alt.png")then
            change_bank_offset(1, pages)
        end
        if GuiImageButton(gui, next_id(), pos_x + 200, pos_y + 190, "", "mods/noita-together/files/ui/arrows/arrow.png")then
            change_bank_offset(10, pages)
        end
        GuiOptionsClear(gui)
    end

    local function draw_player_info(player, userId)
        if (player.sampo) then
            GuiOptionsAddForNextWidget(gui, GUI_OPTION.Layout_NextSameLine)
            GuiZSetForNextWidget(gui, 9)
            GuiImage(gui, next_id(), 88, 0, "mods/noita-together/files/ui/sampo.png", 0.5, 1, 1)
        end
        if (biome_sprites[player.location] ~= nil) then
            GuiOptionsAddForNextWidget(gui, GUI_OPTION.Layout_NextSameLine)
            GuiZSetForNextWidget(gui, 9)
            GuiImage(gui, next_id(), 80, 0, "mods/noita-together/files/ui/biomes/" .. biome_sprites[player.location] , 0.8, 1, 1)
        end
        GuiZSetForNextWidget(gui, 10)
        local lfck, rtck = GuiButton(gui, next_id(), 0,0, player.name)
        if (lfck) then
            follow_player(userId, player.name)
        end
        if (rtck) then
            show_wands = not show_wands
        end
        local _c, _cr, _hover = previous_data(gui)
        local inven = PlayerList[userId].inven
        if (_hover and show_wands and inven ~= nil) then
            wand_displayer = inven
        end
        
        local location = GameTextGetTranslatedOrNot(player.location)
        if (location == nil or location == "_EMPTY_") then location = GameTextGetTranslatedOrNot("$noitatogether_mountain") end
        local tooltip = GameTextGet("$noitatogether_tooltip_player_HP", tostring(math.floor(player.curHp)), tostring(math.floor(player.maxHp)))
        tooltip = tooltip .. "\n" .. GameTextGet("$noitatogether_tooltip_player_location", location)
        tooltip = tooltip .. "\n" .. GameTextGet("$noitatogether_tooltip_player_depth", string.format("%.0fm", player.y and player.y / 10 or 0))
        GuiTooltip(gui, player.name, tooltip)
        GuiOptionsAddForNextWidget(gui, GUI_OPTION.Layout_NextSameLine)
        GuiZSetForNextWidget(gui, 9)
        local bar_w = player.curHp / player.maxHp
        GuiImage(gui, next_id(), 0, 0, "mods/noita-together/files/ui/hpbar_full.png", 1, bar_w, 1)
        GuiZSetForNextWidget(gui, 10)
        GuiImage(gui, next_id(), 0, 0, "mods/noita-together/files/ui/hpbar_empty.png", 1, 1, 1)
        GuiLayoutAddVerticalSpacing(gui, 2)
    end

    local function draw_player_list(players)
        GuiZSetForNextWidget(gui, 10)
        GuiBeginScrollContainer(gui, next_id(), 5, 50, 100, 150, false, 1, 1)
        GuiLayoutBeginVertical(gui, 0, 0)
        for userId, p in ipairs(_Players) do
            local player = PlayerList[p[1]] -- could use players instead shrug
            if (player ~= nil) then
                draw_player_info(player, p[1])
            end
        end

        GuiLayoutEnd(gui)
        GuiEndScrollContainer(gui)
    end

    local function draw_gold_bank()
        local pos_x, pos_y = (screen_width / 2) - 240, (screen_height/2) - 120
        GuiOptionsAdd(gui, GUI_OPTION.NoPositionTween)
        GuiZSetForNextWidget(gui, 10)
        GuiImageNinePiece(gui, next_id(), pos_x, pos_y, 120, 65, 1, "mods/noita-together/files/ui/outer.png")
        GuiZSetForNextWidget(gui, 9)
        GuiText(gui, pos_x, pos_y, GameTextGet("$noitatogether_bank_gold", tostring(BankGold)))

        GuiZSetForNextWidget(gui, 9)
        GuiText(gui, pos_x, pos_y+15, "$noitatogether_bank_gold_xfer_qty")
        GuiZSetForNextWidget(gui, 9)
        gold_amount = GuiTextInput(gui, next_id(), pos_x, pos_y + 25, gold_amount, 120, 10, "0123456789")
        
        --store hover state
        local _, _, _hover = GuiGetPreviousWidgetInfo(gui)
        is_hovering_bank_gold = _hover
        
        GuiZSetForNextWidget(gui, 9)
        GuiImageNinePiece(gui, next_id(), pos_x + 10, pos_y + 54, 30, 5, 1, "mods/noita-together/files/ui/inner_darker.png")
        GuiZSetForNextWidget(gui, 10)
        if (GuiImageButton(gui, next_id(), pos_x+5, pos_y + 47, "", "mods/noita-together/files/ui/button.png")) then
            local amount = tonumber(gold_amount)
            if (amount <= BankGold) then
                SendWsEvent({event="TakeGold", payload={amount=amount}})
                gold_amount = "1"
            end
        end

        GuiZSetForNextWidget(gui, 8)
        GuiText(gui, pos_x + 12 , pos_y +52, "$noitatogether_bank_gold_xfer_withdraw")

        GuiZSetForNextWidget(gui, 9)
        GuiImageNinePiece(gui, next_id(), pos_x + 85, pos_y + 54, 30, 5, 1, "mods/noita-together/files/ui/inner_darker.png")
        GuiZSetForNextWidget(gui, 10)
        if (GuiImageButton(gui, next_id(), pos_x + 80, pos_y + 47, "", "mods/noita-together/files/ui/button.png")) then
            local wallet, gold = nil, 0
            local amount = tonumber(gold_amount)
            wallet, gold = PlayerWalletInfo()
            if (amount <= gold and wallet ~= nil) then
                SendWsEvent({event="SendGold", payload={amount=amount}})
                ComponentSetValue2(wallet, "money", gold - amount)
                gold_amount = "1"
            end
        end
        GuiZSetForNextWidget(gui, 8)
        GuiText(gui, pos_x + 80 , pos_y +52, "$noitatogether_bank_gold_xfer_deposit")
        GuiOptionsClear(gui)
    end

    function draw_player_message()
        local pos_x, pos_y = (screen_width / 2) - 90, (screen_height/2) - 90
        local offx, offy = 1, 20
        GuiOptionsAdd(gui, GUI_OPTION.NoPositionTween)
        GuiZSetForNextWidget(gui, 9)
        GuiImageNinePiece(gui, next_id(), pos_x, pos_y, 160, 100, 1, "mods/noita-together/files/ui/outer.png")
        GuiZSetForNextWidget(gui, 8)
        if (GuiImageButton(gui, next_id(), pos_x + 151, pos_y, "", "mods/noita-together/files/ui/close.png")) then
            player_msg = ""
            show_message = false
        end
        GuiZSetForNextWidget(gui, 8)
        --TODO: this doesnt support characters other than [a-zA-Z0-9 ] (non-english, symbols, etc)
        player_msg = GuiTextInput(gui, next_id(), pos_x, pos_y, player_msg, 150, 99, "QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm0123456789 ")

        --store hover state
        local _, _, _hover = GuiGetPreviousWidgetInfo(gui)
        is_hovering_message_input = _hover

        for _, num in pairs(numbers) do
            if (GuiButton(gui, next_id(), pos_x + offx, pos_y + offy, "["..num.."]")) then
                player_msg = player_msg .. num
            end
            offx = offx + 16
        end
        offy = offy + 12
        offx = 1
        for idx, _letter in pairs(alphabet) do
            local letter = caps_lock and string.upper(_letter) or _letter
            if (GuiButton(gui, next_id(), pos_x + offx, pos_y + offy, "["..letter.."]")) then
                player_msg = player_msg .. letter
            end
            offx = offx + 16
            if (idx % 10 == 0 and idx % 20 == 10) then
                offx = 4
                offy = offy + 12
            elseif (idx % 19 == 0) then
                offx = 0
                offy = offy + 12
                if (GuiButton(gui, next_id(), pos_x + offx, pos_y + offy, "[CAPS]")) then
                    caps_lock = not caps_lock
                end
                offx = 35
            end
        end
        offy = offy + 12
        if (GuiButton(gui, next_id(), pos_x + 60, pos_y + offy, "[SPACE]")) then
            player_msg = player_msg .. " "
        end
        offy = offy + 15
        GuiZSetForNextWidget(gui, 10)
        if (GuiImageButton(gui, next_id(), pos_x + 59, pos_y + offy - 2, "", "mods/noita-together/files/ui/button.png")) then
            local px, py = GetPlayerPos()
            py = py - 10
            if (#player_msg > 0 and GameGetFrameNum() >= last_player_msg and px ~= nil and py ~= nil and NT ~= nil and NT.run_started) then
                if (CanSpawnPoi(px, py)) then
                    SpawnPoi("$noitatogether_message_mine", player_msg,  px, py)
                    SendWsEvent({event="CustomModEvent", payload={name="PlayerPOI", message=player_msg, x=px, y=py}})
                    show_message = false
                    player_msg = ""
                    GamePrint("$noitatogether_message_sent")
                    last_player_msg = GameGetFrameNum() + 60*30
                else
                    GamePrint("$noitatogether_message_cant_too_close")
                end
            else
                GamePrint("$noitatogether_message_cant_too_soon")
            end
        end
        GuiZSetForNextWidget(gui, 9)
        GuiImageNinePiece(gui, next_id(), pos_x + 64, pos_y + offy + 5, 30, 5, 1, "mods/noita-together/files/ui/inner_darker.png")
        GuiZSetForNextWidget(gui, 7)
        GuiText(gui, pos_x + 68 , pos_y + offy + 2, "$noitatogether_message_send")
    end

    function draw_gui()
        --local frame = GameGetFrameNum()
        reset_id()
        GuiStartFrame(gui)
        GuiIdPushString( gui, "noita_together")

        -- controller stuff
        local player = GetPlayer()
        if (player) then
            local platform_shooter_player = EntityGetFirstComponentIncludingDisabled(player, "PlatformShooterPlayerComponent")
            if (platform_shooter_player) then
                local is_gamepad = ComponentGetValue2(platform_shooter_player, "mHasGamepadControlsPrev")
                if (is_gamepad) then
                    GuiOptionsAdd(gui, GUI_OPTION.NonInteractive)
                    GuiOptionsAdd(gui, GUI_OPTION.AlwaysClickable)
                end
            end
            --close on inventory change
            local inven_gui = EntityGetFirstComponent(player, "InventoryGuiComponent")
            if (inven_gui ~= nil) then
                local is_open = ComponentGetValue2(inven_gui, "mActive")

                if (is_open and not last_inven_is_open) then
                    show_bank = false
                end
                last_inven_is_open = is_open
            end
            --[[ ghost selection
                local controls_comp = EntityGetFirstComponent(player, "ControlsComponent")
            if (controls_comp ~= nil) then
                local x, y = ComponentGetValue2(controls_comp, "mMousePosition")
                local mouse_down = ComponentGetValue2(controls_comp, "mButtonDownLeftClick")
                local selected_ghosts = mouse_down and EntityGetInRadiusWithTag(x, y, 24, "nt_ghost") or nil
                if (selected_ghosts ~= nil) then
                    selected_ghosts = selected_ghosts[1]
                    local var_comps = EntityGetComponent(selected_ghosts, "VariableStorageComponent") or {}
                    for _, var in ipairs(var_comps) do
                        if (ComponentGetValue2(var, "name") == "userId") then
                            --selected_player = ComponentGetValue2(var, "value_string")
                        end
                    end
                end
            end
            ]]
        end
        -- close on escape (pause)
        if (show_bank and GamePaused) then
            show_bank = false
        end
        local ghost_button = HideGhosts and "hide_players.png" or "players.png"
        local chat_button = HideChat and "hide_chat.png" or "chat.png"
        local ghost_tooltip = HideGhosts and "$noitatogether_tooltip_player_ghost_toggle_off" or "$noitatogether_tooltip_player_ghost_toggle_on"
        local chat_tooltip = HideChat and "$noitatogether_tooltip_show_chat_toggle_off" or "$noitatogether_tooltip_show_chat_toggle_on"
        
        if (GuiImageButton(gui, next_id(), 79, 0, "", "mods/noita-together/files/ui/buttons/keyboard.png")) then
            if (show_bank) then show_bank = false end
            show_message = not show_message
            if (not show_message) then
                player_msg = ""
            end
        end
        GuiTooltip(gui, "$noitatogether_tooltip_leave_a_message", "")

        if (GuiImageButton(gui, next_id(), 100, 0, "", "mods/noita-together/files/ui/buttons/" .. ghost_button)) then
            HideGhosts = not HideGhosts
            if (HideGhosts) then
                DespawnPlayerGhosts()
            else
                SpawnPlayerGhosts(PlayerList)
            end
        end
        GuiTooltip(gui, ghost_tooltip, "")

        if (GuiImageButton(gui, next_id(), 120, 0, "", "mods/noita-together/files/ui/buttons/" .. chat_button)) then
            HideChat = not HideChat
        end
        GuiTooltip(gui, chat_tooltip, "")

        if (GuiImageButton(gui, next_id(), 140, 0, "", "mods/noita-together/files/ui/buttons/player_list.png")) then
            show_player_list = not show_player_list
        end
        GuiTooltip(gui, "$noitatogether_tooltip_player_list", "")

        if (GuiImageButton(gui, next_id(), 160, 0, "", "mods/noita-together/files/ui/buttons/bank.png")) then
            if (show_message) then show_message = false end
            show_bank = not show_bank
        end
        GuiTooltip(gui, "$noitatogether_tooltip_item_bank", "")

        if (show_message) then
            draw_player_message()
        else
            --clear textbox hovering flag - in case hovering while message view closed
            is_hovering_message_input = false
        end

        if (show_player_list) then
            draw_player_list(PlayerList)
        end

        if (show_bank) then
            draw_item_bank()
            if(GameHasFlagRun("NT_send_gold")) then
                draw_gold_bank()
            end
        else
            --clear textbox hovering flags - in case hovering while bank view closed
            is_hovering_bank_filter = false
            is_hovering_bank_gold = false
        end

        --check if we are currently hovering any textinputs and lock/unlock player controls as needed
        --don't need to do this unless the run is actually started
        if (NT ~= nil and NT.run_started) then 
            local is_hovering_textbox = is_hovering_bank_filter or is_hovering_bank_gold or is_hovering_message_input

            if (is_hovering_textbox and not was_hovering_textbox) then
                LockPlayer()
            elseif ( not is_hovering_textbox and was_hovering_textbox) then
                UnlockPlayer()
            end

            was_hovering_textbox = is_hovering_textbox
        end
        
        local seed = ModSettingGet( "noita_together.seed" )
        local current_seed = tonumber(StatsGetValue("world_seed"))
        if (current_seed ~= seed and seed > 0) then
            GuiImageNinePiece(gui, next_id(), (screen_width / 2) - 90, 50, 180, 20, 0.8)
            GuiText(gui, (screen_width / 2) - 80, 55, "$noitatogether_host_changed_seed")
        end

        if (NT ~= nil and NT.run_ended) then
            GuiImageNinePiece(gui, next_id(), (screen_width / 2) - 90, 50, 180, 20, 0.8)
            GuiText(gui, (screen_width / 2) - 80, 55, NT.end_msg)
        end

        if (selected_player and PlayerList[selected_player] ~= nil) then
            GuiImageNinePiece(gui, next_id(), 5, 210, 90, 80, 0.5)
            if (GuiButton(gui, next_id(), 5, 210, "[x]")) then
                selected_player = ""
            end
            GuiText(gui, 5, 215, PlayerList[selected_player].name)
        end

        if (PlayerRadar) then
            local ghosts = EntityGetWithTag("nt_follow") or {}
            local ppos_x, ppos_y = GetPlayerOrCameraPos()
            local pos_x, pos_y = screen_width / 2, screen_height /2
            for _, ghost in ipairs(ghosts) do
                local var_comp = get_variable_storage_component(ghost, "userId")
                local user_id = ComponentGetValue2(var_comp, "value_string")
                local gx, gy = EntityGetTransform(ghost)
                local dir_x = (gx or 0) - ppos_x
                local dir_y = (gy or 0) - ppos_y
                local dist = math.sqrt(dir_x * dir_x + dir_y * dir_y)
                if (math.abs(dir_x) > 250 or math.abs(dir_y) > 150) then
                    dir_x,dir_y = vec_normalize(dir_x,dir_y)
                    local indicator_x = math.max(30, (pos_x - 30) + dir_x * 300)
                    local indicator_y = pos_y + dir_y * 170
                    GuiImage(gui, next_id(), indicator_x, indicator_y, "mods/noita-together/files/ui/player_ghost.png", 1, 1, 1)
                    GuiTooltip(gui, (PlayerList[user_id].name or ""), string.format("%.0fm", math.floor(dist/10)))
                end
            end
        end
        if (#wand_displayer > 0) then
            local wand_offset = 0
            local wand_offset_y = 0
            for _, item in ipairs(wand_displayer) do
                local nx, ny = (screen_width / 4) + 30 + wand_offset, (screen_height/2) - 160
                render_wand(item, x, y, nx, ny + wand_offset_y, false, true) 
                wand_offset = wand_offset + 165
                if (_ % 2 == 0) then 
                    wand_offset = 0
                    wand_offset_y = 165
                 end
            end
            wand_displayer = {}
        end

        GuiIdPop(gui)
    end
end