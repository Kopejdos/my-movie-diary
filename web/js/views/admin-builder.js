// Stavitel kolekcí v admin panelu (#/admin/builder, V4.3.2).
//
// Nová kolekce bez ručního hledání filmu po filmu:
//   Person      – filmografie osoby z TMDB (režie / herectví / scénář), např. Sergio Leone;
//   Two people  – filmy dvou osob: společné (Together) i sólovky, např. Bud Spencer & Terence Hill;
//   Studio      – filmy produkční společnosti (Hammer, Toho, A24…);
//   Keyword     – filmy s klíčovým slovem TMDB (spaghetti western, kaiju…).
// Filmy se profiltrují (role, hlasy, roky, bez dokumentů), zaškrtnou a založí se kolekce –
// stejnou akcí jako schválení požadavku na kolekci (create-collection). Skupiny se dají pojmenovat
// (Together / jméno osoby) nebo rozdělit po desetiletích. Kolekci pak jde doladit v editoru.

import {
    searchPeople, fetchPersonFilms, searchCompanies, searchKeywords, discoverFilms, createCollection,
} from "../admin.js";
import { TEXTS, format, movies } from "../texts.js";
import { h, mount, poster, pill, toast, loadingView } from "../dom.js";
import { requireAdminView, adminHeader } from "./admin.js";
import { similarBox } from "./admin-requests.js";

const SOURCES = ["person", "two", "studio", "keyword"];
const DOCUMENTARY = 99;                 // žánr TMDB „Documentary“
const KINDS = [["series", "kindSeries"], ["studio", "kindStudio"], ["director", "kindDirectorOption"], ["genre", "kindGenre"], ["path", "kindPathOption"]];

export function adminBuilderView(container) {
    if (!requireAdminView(container)) return;
    document.title = `${TEXTS.adminBuilderTitle} · ${TEXTS.adminTitle}`;

    const state = {
        source: "person",
        picked: { a: null, b: null },      // vybraná osoba / studio / klíčové slovo
        people: [],                        // jména osob z TMDB (a, b)
        films: [],                         // kandidáti
        total: 0,
        selected: new Set(),
    };

    const sourceTabs = h("div", { class: "segmented", role: "group", "aria-label": TEXTS.adminBuilderSource });
    const sourceBox = h("div", { class: "builder-source" });
    const filmsBox = h("div", { class: "builder-films" });
    const createBox = h("section", { class: "admin-form builder-create", hidden: true });

    // ----- 1. Zdroj ----------------------------------------------------------

    function renderSourceTabs() {
        mount(sourceTabs, SOURCES.map((source) => h("button", {
            class: `segmented__option${state.source === source ? " segmented__option--active" : ""}`,
            type: "button", "aria-pressed": String(state.source === source),
            onClick: () => {
                if (state.source === source) return;
                state.source = source;
                state.picked = { a: null, b: null };
                state.films = [];
                state.selected.clear();
                renderAll();
            },
        }, TEXTS[`adminBuilderSource_${source}`])));
    }

    /** Hledání osoby / studia / klíčového slova a výběr jednoho výsledku. */
    function picker(slot, placeholder) {
        if (state.picked[slot]) {
            const item = state.picked[slot];
            return h("div", { class: "builder-picked" },
                h("strong", {}, item.name),
                item.detail ? h("span", { class: "muted" }, item.detail) : null,
                h("button", {
                    class: "btn btn--small", type: "button",
                    onClick: () => {
                        state.picked[slot] = null;
                        state.films = [];
                        state.selected.clear();
                        renderAll();
                    },
                }, TEXTS.adminBuilderChange));
        }
        const input = h("input", {
            type: "search", class: "admin-input admin-input--grow", placeholder, "aria-label": placeholder,
        });
        const results = h("div", { class: "builder-results" });
        const submit = h("button", { class: "btn btn--primary", type: "submit" }, TEXTS.adminSearch);
        async function search(event) {
            event.preventDefault();
            if (!input.value.trim()) return;
            submit.disabled = true;
            mount(results, loadingView());
            try {
                const found = state.source === "studio" ? await searchCompanies(input.value)
                    : state.source === "keyword" ? await searchKeywords(input.value)
                    : await searchPeople(input.value);
                mount(results, found.length === 0
                    ? h("p", { class: "muted" }, TEXTS.adminNoResults)
                    : found.map((item) => h("button", {
                        class: "builder-result", type: "button",
                        onClick: () => pick(slot, item),
                    },
                        h("strong", {}, item.name),
                        h("span", { class: "muted" }, resultDetail(item)))));
            } catch (error) {
                mount(results, h("p", { class: "form-error" }, format("errorGeneric", error.message)));
            }
            submit.disabled = false;
        }
        return h("form", { class: "builder-picker", onSubmit: search },
            h("div", { class: "admin-search" }, input, submit),
            results);
    }

    function resultDetail(item) {
        if (item.department !== undefined) {
            return [item.department, ...(item.known_for ?? [])].filter(Boolean).join(" · ");
        }
        return item.country ?? "";
    }

    function pick(slot, item) {
        state.picked[slot] = { id: item.id, name: item.name, detail: resultDetail(item), department: item.department };
        // Výchozí role podle toho, čím je osoba známá (režisér → režie)
        if (slot === "a" && item.department) filters.role.value = item.department === "Directing" ? "directing" : "acting";
        renderSource();
        loadFilms();
    }

    // Řazení a počet filmů u studia / klíčového slova
    const sort = h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminBuilderSort },
        ["popularity", "votes", "year"].map((value) => h("option", { value }, TEXTS[`adminBuilderSort_${value}`])));
    const pages = h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminBuilderHowMany },
        [2, 5, 10].map((value) => h("option", { value, selected: value === 5 }, movies(value * 20))));
    sort.addEventListener("change", () => loadFilms());
    pages.addEventListener("change", () => loadFilms());

    function renderSource() {
        const two = state.source === "two";
        const company = state.source === "studio" || state.source === "keyword";
        const placeholder = state.source === "studio" ? TEXTS.adminBuilderSearchStudio
            : state.source === "keyword" ? TEXTS.adminBuilderSearchKeyword : TEXTS.adminBuilderSearchPerson;
        mount(sourceBox,
            h("p", { class: "hint" }, TEXTS[`adminBuilderHint_${state.source}`]),
            two
                ? h("div", { class: "builder-two" },
                    h("div", {}, h("span", { class: "field__label" }, TEXTS.adminBuilderFirstPerson), picker("a", placeholder)),
                    h("div", {}, h("span", { class: "field__label" }, TEXTS.adminBuilderSecondPerson), picker("b", placeholder)))
                : picker("a", placeholder),
            company ? h("div", { class: "admin-row__fields" },
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderSort), sort),
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderHowMany), pages)) : null);
    }

    // ----- 2. Filmy --------------------------------------------------------

    async function loadFilms() {
        const { a, b } = state.picked;
        if (!a || (state.source === "two" && !b)) {
            renderFilms();
            return;
        }
        mount(filmsBox, loadingView());
        try {
            if (state.source === "studio" || state.source === "keyword") {
                const result = await discoverFilms({
                    [state.source === "studio" ? "company_id" : "keyword_id"]: a.id,
                    sort: sort.value, pages: Number(pages.value),
                });
                state.films = result.films;
                state.total = result.total;
                state.people = [];
            } else {
                const result = await fetchPersonFilms(a.id, state.source === "two" ? b.id : null);
                state.films = result.films;
                state.total = result.films.length;
                state.people = result.people;
            }
            state.selected.clear();
            // Předvybrané: co projde filtrem a ještě v MMD není
            for (const film of shownFilms()) if (!film.in_catalog) state.selected.add(film.tmdb_id);
            renderFilms();
            renderCreate();
        } catch (error) {
            mount(filmsBox, h("p", { class: "form-error" }, format("errorGeneric", error.message)));
        }
    }

    const filters = {
        role: h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminBuilderRole },
            ["any", "acting", "directing", "writing"].map((value) => h("option", { value }, TEXTS[`adminBuilderRole_${value}`]))),
        together: h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminBuilderShow },
            ["all", "together", "a", "b"].map((value) => h("option", { value }, TEXTS[`adminBuilderShow_${value}`]))),
        minVotes: h("input", { type: "number", class: "admin-input admin-input--number", min: 0, value: 20, "aria-label": TEXTS.adminBuilderMinVotes }),
        from: h("input", { type: "number", class: "admin-input admin-input--number", min: 1880, max: 2100, placeholder: "—", "aria-label": TEXTS.adminBuilderFrom }),
        to: h("input", { type: "number", class: "admin-input admin-input--number", min: 1880, max: 2100, placeholder: "—", "aria-label": TEXTS.adminBuilderTo }),
        noDocs: h("input", { type: "checkbox", checked: true }),
        hideKnown: h("input", { type: "checkbox" }),
    };
    for (const input of Object.values(filters)) input.addEventListener("change", () => renderFilms());
    for (const input of [filters.minVotes, filters.from, filters.to]) input.addEventListener("input", () => renderFilms());

    /** Má osoba (a / b) ve filmu roli podle filtru? */
    function hasRole(film, key) {
        const roles = film.roles?.[key] ?? [];
        return filters.role.value === "any" ? roles.length > 0 : roles.includes(filters.role.value);
    }

    /** Ke komu film patří: together / a / b (jen u dvou osob), jinak a. */
    function ownerOf(film) {
        if (state.source !== "two") return "a";
        const a = hasRole(film, "a");
        const b = hasRole(film, "b");
        return a && b ? "together" : a ? "a" : b ? "b" : null;
    }

    function shownFilms() {
        const minVotes = Number(filters.minVotes.value) || 0;
        const from = Number(filters.from.value) || 0;
        const to = Number(filters.to.value) || 9999;
        const person = state.source === "person" || state.source === "two";
        return state.films.filter((film) => {
            const year = Number(film.year) || 0;
            if (film.vote_count < minVotes) return false;
            if ((from && year < from) || (to < 9999 && year > to) || (!year && (from || to < 9999))) return false;
            if (filters.noDocs.checked && film.genre_ids.includes(DOCUMENTARY)) return false;
            if (filters.hideKnown.checked && film.in_catalog) return false;
            if (person) {
                const owner = ownerOf(film);
                if (!owner) return false;
                if (state.source === "two" && filters.together.value !== "all" && owner !== filters.together.value) return false;
            }
            return true;
        });
    }

    function renderFilms() {
        if (state.films.length === 0) {
            mount(filmsBox, state.picked.a ? h("p", { class: "muted" }, TEXTS.adminNoResults) : null);
            renderCreate();
            return;
        }
        const shown = shownFilms();
        const person = state.source === "person" || state.source === "two";
        const names = { a: state.people[0]?.name ?? "A", b: state.people[1]?.name ?? "B" };
        const count = h("span", { class: "builder-count" });
        const updateCount = () => {
            count.textContent = format("adminBuilderSelected", state.selected.size, shown.length);
            renderCreate();
        };

        mount(filmsBox,
            h("div", { class: "section-title" },
                h("h2", {}, TEXTS.adminBuilderMovies),
                h("span", { class: "muted" }, state.source === "studio" || state.source === "keyword"
                    ? format("adminBuilderTotal", state.films.length, state.total)
                    : movies(state.films.length))),
            h("div", { class: "builder-filters admin-row__fields" },
                person ? h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderRole), filters.role) : null,
                state.source === "two" ? h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderShow), filters.together) : null,
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderMinVotes), filters.minVotes),
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderFrom), filters.from),
                h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderTo), filters.to),
                h("label", { class: "mini-check" }, filters.noDocs, h("span", {}, TEXTS.adminBuilderNoDocs)),
                h("label", { class: "mini-check" }, filters.hideKnown, h("span", {}, TEXTS.adminBuilderHideKnown))),
            h("div", { class: "builder-bulk" },
                count,
                h("button", { class: "btn btn--small", type: "button", onClick: () => {
                    shown.forEach((film) => state.selected.add(film.tmdb_id));
                    renderFilms();
                } }, TEXTS.adminBuilderSelectAll),
                h("button", { class: "btn btn--small", type: "button", onClick: () => {
                    state.selected.clear();
                    renderFilms();
                } }, TEXTS.adminBuilderSelectNone)),
            shown.length === 0
                ? h("p", { class: "muted" }, TEXTS.adminBuilderNothingShown)
                : h("ul", { class: "builder-list" }, shown.map((film) => {
                    const box = h("input", { type: "checkbox", checked: state.selected.has(film.tmdb_id) });
                    box.addEventListener("change", () => {
                        if (box.checked) state.selected.add(film.tmdb_id); else state.selected.delete(film.tmdb_id);
                        updateCount();
                    });
                    const owner = person ? ownerOf(film) : null;
                    return h("li", {},
                        h("label", { class: "builder-film" },
                            box,
                            poster(film.poster_path, film.title, "req-result__poster", false, "tiny"),
                            h("span", { class: "builder-film__info" },
                                h("strong", {}, film.title, film.year ? h("span", { class: "muted" }, ` (${film.year})`) : null),
                                h("span", { class: "pills" },
                                    film.in_catalog ? pill(TEXTS.requestsInCatalog, true) : null,
                                    state.source === "two" && owner ? pill(owner === "together" ? TEXTS.adminBuilderTogether : names[owner]) : null,
                                    person && state.source === "person" ? pill(film.roles.a.map((r) => TEXTS[`adminBuilderRole_${r}`] ?? r).join(", ")) : null,
                                    pill(format("adminBuilderVotes", film.vote_count))))));
                })));
        updateCount();
    }

    // ----- 3. Založení kolekce -------------------------------------------

    const create = {
        name: h("input", { type: "text", class: "admin-input admin-input--grow", maxlength: 80, "aria-label": TEXTS.adminName, placeholder: TEXTS.adminName }),
        description: h("input", { type: "text", class: "admin-input admin-input--grow", maxlength: 200, "aria-label": TEXTS.adminDescription, placeholder: TEXTS.adminDescription }),
        kind: h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminKind },
            KINDS.map(([value, key]) => h("option", { value }, TEXTS[key]))),
        grouping: h("select", { class: "admin-input admin-select", "aria-label": TEXTS.adminBuilderGrouping }),
        together: h("input", { type: "text", class: "admin-input", maxlength: 60, value: "Together", "aria-label": TEXTS.adminBuilderTogether }),
        groupA: h("input", { type: "text", class: "admin-input", maxlength: 60, "aria-label": TEXTS.adminBuilderFirstPerson }),
        groupB: h("input", { type: "text", class: "admin-input", maxlength: 60, "aria-label": TEXTS.adminBuilderSecondPerson }),
        result: h("div", { class: "builder-result-box", "aria-live": "polite" }),
    };
    create.grouping.addEventListener("change", () => renderCreate());
    let defaultsFor = "";           // pro které vybrané zdroje už se předvyplnil název

    function fillDefaults() {
        const key = `${state.source}:${state.picked.a?.id}:${state.picked.b?.id}`;
        if (key === defaultsFor) return;
        defaultsFor = key;
        const [a, b] = state.people;
        create.name.value = state.source === "two" && a && b ? `${a.name} & ${b.name}` : state.picked.a?.name ?? "";
        create.groupA.value = a?.name ?? "";
        create.groupB.value = b?.name ?? "";
        // Režisér (role režie u jedné osoby) → kolekce typu Director (V4.3.5)
        create.kind.value = state.source === "studio" ? "studio" : state.source === "keyword" ? "genre"
            : state.source === "person" && filters.role.value === "directing" ? "director" : "series";
        mount(create.grouping,
            h("option", { value: "none" }, TEXTS.adminBuilderGroup_none),
            h("option", { value: "decade" }, TEXTS.adminBuilderGroup_decade),
            state.source === "two" ? h("option", { value: "people" }, TEXTS.adminBuilderGroup_people) : null);
        create.grouping.value = state.source === "two" ? "people" : "none";
        mount(create.result);
    }

    // Podobné kolekce ke vybraným filmům (V4.3.3) – po chvíli klidu, ne při každém zaškrtnutí
    const similarHolder = h("div");
    let similarTimer = null;
    let similarFor = "";
    function refreshSimilar() {
        clearTimeout(similarTimer);
        similarTimer = setTimeout(() => {
            const ids = [...state.selected];
            const key = `${ids.join()}|${create.name.value.trim()}`;
            if (key === similarFor) return;
            similarFor = key;
            mount(similarHolder, ids.length >= 2 || create.name.value.trim().length >= 4
                ? similarBox(ids, create.name.value.trim())
                : null);
        }, 600);
    }
    create.name.addEventListener("input", refreshSimilar);

    function renderCreate() {
        createBox.hidden = state.films.length === 0;
        if (state.films.length === 0) {
            mount(createBox);
            return;
        }
        fillDefaults();
        refreshSimilar();
        const button = h("button", { class: "btn btn--primary", type: "button", onClick: () => submit(button) },
            format("adminBuilderCreate", movies(state.selected.size)));
        button.disabled = state.selected.size < 2;
        mount(createBox,
            h("h2", { class: "admin-form__title" }, TEXTS.adminBuilderCreateTitle),
            h("div", { class: "admin-form__grid" },
                h("label", { class: "field" }, h("span", { class: "field__label" }, TEXTS.adminName), create.name),
                h("label", { class: "field" }, h("span", { class: "field__label" }, TEXTS.adminDescription), create.description),
                h("label", { class: "field" }, h("span", { class: "field__label" }, TEXTS.adminKind), create.kind),
                h("label", { class: "field" }, h("span", { class: "field__label" }, TEXTS.adminBuilderGrouping), create.grouping)),
            create.grouping.value === "people"
                ? h("div", { class: "admin-row__fields" },
                    h("label", { class: "mini-field" }, h("span", {}, TEXTS.adminBuilderTogether), create.together),
                    h("label", { class: "mini-field" }, h("span", {}, state.people[0]?.name ?? "A"), create.groupA),
                    h("label", { class: "mini-field" }, h("span", {}, state.people[1]?.name ?? "B"), create.groupB))
                : null,
            similarHolder,
            h("p", { class: "hint" }, TEXTS.adminBuilderCreateHint),
            h("div", { class: "admin-form__actions" }, button),
            create.result);
    }

    /** Vybrané filmy v pořadí kolekce: po skupinách (Together, A, B), uvnitř podle premiéry. */
    function itemsToCreate() {
        const grouping = create.grouping.value;
        const order = { together: 0, a: 1, b: 2 };
        const names = { together: create.together.value.trim(), a: create.groupA.value.trim(), b: create.groupB.value.trim() };
        const chosen = state.films.filter((film) => state.selected.has(film.tmdb_id));
        const byDate = (x, y) => (x.release_date || "9999").localeCompare(y.release_date || "9999");
        if (grouping === "people") {
            return chosen
                .map((film) => ({ film, owner: ownerOf(film) ?? "a" }))
                .sort((x, y) => order[x.owner] - order[y.owner] || byDate(x.film, y.film))
                .map(({ film, owner }) => ({ tmdb_id: film.tmdb_id, group_label: names[owner] || null }));
        }
        return [...chosen].sort(byDate).map((film) => ({
            tmdb_id: film.tmdb_id,
            group_label: grouping === "decade" && film.year ? `${film.year.slice(0, 3)}0s` : null,
        }));
    }

    async function submit(button) {
        const name = create.name.value.trim();
        if (!name) {
            toast(TEXTS.adminNameRequired, "error");
            create.name.focus();
            return;
        }
        button.disabled = true;
        button.textContent = TEXTS.adminEditorSaving;
        try {
            const result = await createCollection({
                name,
                description: create.description.value.trim() || null,
                kind: create.kind.value,
                items: itemsToCreate(),
            });
            toast(format("adminNewCollectionCreated", result.name, movies(result.films)));
            mount(create.result,
                h("p", {}, format("adminNewCollectionCreated", result.name, movies(result.films)), " ",
                    h("a", { href: `#/admin/collection/${result.slug}` }, `${TEXTS.adminEdit} →`)),
                h("details", { class: "panel-details" },
                    h("summary", {}, TEXTS.adminBuilderSeedBlock),
                    h("pre", { class: "admin-seed__code" }, result.seed)));
            // Nově založené už jsou v katalogu
            for (const film of state.films) if (state.selected.has(film.tmdb_id)) film.in_catalog = true;
            state.selected.clear();
            renderFilms();
        } catch (error) {
            toast(format("errorGeneric", error.message), "error");
            button.disabled = false;
            button.textContent = format("adminBuilderCreate", movies(state.selected.size));
        }
    }

    function renderAll() {
        renderSourceTabs();
        renderSource();
        renderFilms();
    }
    renderAll();

    mount(container,
        adminHeader("builder"),
        h("section", { class: "admin-form builder" },
            h("div", { class: "builder__top" },
                h("h2", { class: "admin-form__title" }, TEXTS.adminBuilderTitle),
                sourceTabs),
            sourceBox),
        filmsBox,
        createBox,
    );
}
