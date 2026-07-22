<script setup lang="ts">
import ProfileAvatar from '~/components/profile/ProfileAvatar.vue'
import ProfileSocialLinks from '~/components/profile/ProfileSocialLinks.vue'
import type { PublicProfile } from '~/types/settings'

interface Props {
  profile: PublicProfile
  showClose?: boolean
  titleId?: string
}

const props = withDefaults(defineProps<Props>(), {
  showClose: true,
  titleId: 'profile-detail-title'
})

defineEmits<{ close: [] }>()
</script>

<template>
  <article class="profile-detail">
    <button
      v-if="props.showClose"
      class="profile-detail__close"
      type="button"
      aria-label="关闭完整个人资料"
      data-profile-close
      @click="$emit('close')"
    >
      <span aria-hidden="true">✕</span>
    </button>

    <div class="profile-detail__content">
      <header class="profile-detail__hero">
        <div class="profile-detail__identity">
          <ProfileAvatar :name="props.profile.name" :src="props.profile.avatarUrl" size="detail" />
          <div>
            <h2 :id="props.titleId">{{ props.profile.name }}</h2>
            <p class="profile-detail__role">{{ props.profile.role }}</p>
            <p v-if="props.profile.location" class="profile-detail__location">{{ props.profile.location }}</p>
          </div>
        </div>

        <p class="profile-detail__signature">{{ props.profile.signature }}</p>

        <div class="profile-detail__hero-footer">
          <p v-if="props.profile.currentStatus" class="profile-detail__status">{{ props.profile.currentStatus }}</p>
          <ProfileSocialLinks :links="props.profile.socialLinks" />
        </div>
      </header>

      <p v-if="props.profile.introduction" class="profile-detail__copy">{{ props.profile.introduction }}</p>
      <p v-if="props.profile.topics.length" class="profile-detail__topics">{{ props.profile.topics.join(' · ') }}</p>

      <section v-if="props.profile.projects.length" class="profile-detail__section" aria-labelledby="profile-projects-title">
        <div class="profile-detail__section-head">
          <h3 id="profile-projects-title">作品</h3>
        </div>
        <div class="profile-projects">
          <article v-for="(project, index) in props.profile.projects" :key="`${project.name}-${index}`" class="profile-project">
            <span class="profile-project__number">{{ String(index + 1).padStart(2, '0') }}</span>
            <div>
              <h4>
                <a
                  v-if="project.url"
                  :href="project.url"
                  :target="/^https?:\/\//i.test(project.url) ? '_blank' : undefined"
                  :rel="/^https?:\/\//i.test(project.url) ? 'noopener noreferrer' : undefined"
                >{{ project.name }}</a>
                <span v-else>{{ project.name }}</span>
              </h4>
              <p>{{ project.description }}</p>
              <div v-if="project.tags.length" class="profile-project__tags">{{ project.tags.join(' · ') }}</div>
            </div>
            <span v-if="project.status" class="profile-project__status">{{ project.status }}<span v-if="project.url" aria-hidden="true"> ↗</span></span>
          </article>
        </div>
      </section>

      <section
        v-if="props.profile.journeyEnabled && props.profile.journey.length"
        class="profile-detail__section"
        aria-labelledby="profile-journey-title"
      >
        <div class="profile-detail__section-head">
          <h3 id="profile-journey-title">足迹</h3>
        </div>
        <div class="profile-journey">
          <article v-for="(entry, index) in props.profile.journey" :key="`${entry.period}-${entry.title}-${index}`" class="profile-journey__item">
            <div class="profile-journey__date">{{ entry.period }}</div>
            <div>
              <h4>{{ entry.title }}<span v-if="entry.role"> · {{ entry.role }}</span></h4>
              <p>{{ entry.description }}</p>
            </div>
          </article>
        </div>
      </section>
    </div>
  </article>
</template>

<style scoped>
.profile-detail {
  position: relative;
  display: block;
  width: min(920px, 100%);
  max-height: min(760px, calc(100vh - 84px));
  overflow: hidden;
  color: var(--color-text);
  border: 1px solid rgba(var(--color-accent-rgb), 0.22);
  border-radius: 32px;
  background: var(--color-page);
  box-shadow: 0 48px 140px rgba(var(--color-text-rgb), 0.3), inset 0 1px 0 rgba(var(--color-text-rgb), 0.08);
}

.profile-detail__close {
  position: absolute;
  z-index: 3;
  top: 18px;
  right: 18px;
  display: grid;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  place-items: center;
  color: var(--color-muted);
  background: transparent;
  opacity: 0.72;
  cursor: pointer;
}

.profile-detail__close:hover,
.profile-detail__close:focus-visible {
  color: var(--color-accent);
  opacity: 1;
  outline: none;
}

.profile-detail__close:focus-visible {
  box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.18);
}

.profile-detail__content {
  max-width: 730px;
  max-height: min(760px, calc(100vh - 84px));
  margin: 0 auto;
  padding: 58px 64px 62px;
  overflow-y: auto;
  scrollbar-width: none;
}

.profile-detail__content::-webkit-scrollbar {
  display: none;
}

.profile-detail__hero {
  position: relative;
  padding: 4px 0 36px;
  border-bottom: 1px solid var(--color-line);
  isolation: isolate;
}

.profile-detail__hero::after {
  position: absolute;
  z-index: -1;
  top: -92px;
  right: -80px;
  width: 260px;
  height: 210px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--color-accent-warm-rgb), 0.09), transparent 68%);
  content: '';
  pointer-events: none;
}

.profile-detail__identity {
  display: flex;
  align-items: center;
  gap: 18px;
}

.profile-detail__identity h2 {
  margin: 0 0 5px;
  font-family: var(--font-display);
  font-size: 1.82rem;
  font-weight: 620;
  line-height: 1.08;
  letter-spacing: -0.034em;
}

.profile-detail__role {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.82rem;
  line-height: 1.5;
  letter-spacing: 0.012em;
}

.profile-detail__location {
  margin: 5px 0 0;
  color: var(--color-muted);
  font-size: 0.72rem;
  letter-spacing: 0.025em;
}

.profile-detail__signature {
  max-width: 19em;
  margin: 34px 0 0;
  font-family: var(--font-display);
  font-size: clamp(1.7rem, 3vw, 2.26rem);
  font-weight: 540;
  line-height: 1.32;
  letter-spacing: -0.034em;
  overflow-wrap: anywhere;
  text-wrap: balance;
}

.profile-detail__hero-footer {
  display: flex;
  margin-top: 24px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.profile-detail__status {
  display: inline-flex;
  margin: 0;
  align-items: center;
  gap: 6px;
  color: var(--color-accent);
  font-size: 0.73rem;
  font-weight: 700;
}

.profile-detail__status::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 4px color-mix(in srgb, currentColor 13%, transparent);
  content: '';
}

.profile-detail__copy {
  max-width: 61ch;
  margin: 34px 0 0;
  color: var(--color-muted);
  font-size: 0.94rem;
  line-height: 1.95;
  overflow-wrap: anywhere;
  text-align: justify;
  text-justify: inter-ideograph;
  text-wrap: pretty;
  white-space: pre-line;
}

.profile-detail__topics {
  margin: 18px 0 0;
  color: var(--color-accent);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.7;
  letter-spacing: 0.055em;
  text-transform: uppercase;
}

.profile-detail__section {
  margin-top: 46px;
}

.profile-detail__section-head {
  display: flex;
  margin-bottom: 18px;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.profile-detail__section-head h3 {
  display: flex;
  margin: 0;
  align-items: center;
  gap: 10px;
  font-family: var(--font-display);
  font-size: 1.18rem;
  font-weight: 600;
}

.profile-detail__section-head h3::before {
  width: 18px;
  height: 1px;
  background: var(--color-accent-warm);
  content: '';
  opacity: 0.75;
}

.profile-projects {
  display: grid;
  border-top: 1px solid var(--color-line);
}

.profile-project {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  gap: 14px;
  margin-inline: -10px;
  padding: 19px 10px;
  align-items: baseline;
  border-bottom: 1px solid var(--color-line);
  border-radius: 10px;
}

.profile-project:hover {
  background: rgba(var(--color-accent-rgb), 0.045);
}

.profile-project__number {
  color: var(--color-muted);
  font-family: var(--font-display);
  font-size: 0.69rem;
  font-variant-numeric: tabular-nums;
}

.profile-project__status {
  color: var(--color-accent);
  font-size: 0.61rem;
  font-weight: 800;
  letter-spacing: 0.075em;
  text-transform: uppercase;
  white-space: nowrap;
}

.profile-project h4 {
  margin: 0 0 6px;
  font-family: var(--font-display);
  font-size: 1.04rem;
  font-weight: 620;
  letter-spacing: -0.012em;
}

.profile-project h4 a {
  text-decoration: none;
}

.profile-project h4 a:hover,
.profile-project h4 a:focus-visible {
  color: var(--color-accent);
  outline: none;
}

.profile-project p {
  max-width: 49ch;
  margin: 0;
  color: var(--color-muted);
  font-size: 0.78rem;
  line-height: 1.68;
}

.profile-project__tags {
  margin-top: 9px;
  color: var(--color-accent);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.035em;
}

.profile-journey {
  display: grid;
  gap: 22px;
}

.profile-journey__item {
  display: grid;
  grid-template-columns: 94px minmax(0, 1fr);
  gap: 18px;
  padding-left: 12px;
  border-left: 1px solid rgba(var(--color-accent-rgb), 0.18);
}

.profile-journey__date {
  padding-top: 2px;
  color: var(--color-accent-warm);
  font-size: 0.64rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.045em;
}

.profile-journey h4 {
  margin: 0 0 5px;
  font-family: var(--font-display);
  font-size: 0.93rem;
  font-weight: 610;
}

.profile-journey p {
  max-width: 48ch;
  margin: 0;
  color: var(--color-muted);
  font-size: 0.78rem;
  line-height: 1.68;
}

@media (max-width: 860px) {
  .profile-detail__content {
    padding: 36px 32px 44px;
  }
}

@media (max-width: 620px) {
  .profile-detail {
    align-self: stretch;
    max-height: none;
    border-radius: 25px;
  }

  .profile-detail__content {
    max-height: calc(100dvh - 20px);
    padding: 30px 24px 40px;
  }

  .profile-detail__close {
    top: 14px;
    right: 14px;
  }

  .profile-detail__signature {
    font-size: 1.62rem;
  }

  .profile-detail__hero-footer {
    align-items: flex-start;
  }

  .profile-detail__copy {
    text-align: start;
  }

  .profile-project {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .profile-project__status {
    grid-column: 2;
  }

  .profile-journey__item {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}
</style>
