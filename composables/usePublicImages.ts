import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from 'vue'
import type { Envelope } from '~/composables/usePublicApi'
import type { PublicSiteConfigView } from '~/types/public-view'
import {
  imageVariantSrcset,
  imageVariantUrl,
  type ImageVariantName,
  type PublicImageTemplates
} from '~/utils/image-templates'

const imageTemplatesKey: InjectionKey<ComputedRef<PublicImageTemplates | null>> =
  Symbol('tblog-public-image-templates')

export function providePublicImages(data: Ref<Envelope<PublicSiteConfigView> | null | undefined>) {
  const templates = computed(() => data.value?.data.image?.templates ?? null)
  provide(imageTemplatesKey, templates)
  return templates
}

export function usePublicImages() {
  const templates = inject(imageTemplatesKey, computed(() => null))
  return {
    templates,
    variant(sourceUrl: string, name: ImageVariantName) {
      return imageVariantUrl(templates.value, name, sourceUrl)
    },
    srcset(sourceUrl: string) {
      return imageVariantSrcset(templates.value, sourceUrl)
    }
  }
}
